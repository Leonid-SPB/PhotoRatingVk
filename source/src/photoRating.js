/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires VkApiWrapper, jQuery, highslide, spin.js
/* globals $, Utils, VkApiWrapper, VkAppUtils, VK*/

var Settings = {
  VkAppLocation: "https://vk.com/ratingphoto2", //app5597335 - beta app
  GetPhotosChunksSz: 200,
  ErrorHideAfter: 6000,
  MaxRatedPhotos: 500,
  MaxTotalPhotos: 1000000,
  RateRequestDelay: 2000,
  NoteHideAfter: 15000,
  BlinkDelay: 500,
  BlinkCount: 12,
  RedirectDelay: 3000,
  MaxGroupNameLen: 40,
  MaxFriendsList: 500,
  MaxLikeThresh: 1000,
  DefaultLikesThresh: 1,
  RatingRefreshDelay: 700,
  MaxSelectedThumbs: 10,
  WallAlbumId: -7,

  QueryUserFields: "first_name,last_name,screen_name,first_name_gen,last_name_gen",

  vkUserId: null,
  vkSid: null,
  likedThresh: 1
};

var RPApi = {
  $progressBar: null,
  vkUserList: null,
  vkGroupList: null,
  vkIdEdit: null,
  albumListSel: null,
  $totalPhotosSpan: null,
  $ratedPhotosSpan: null,
  $chosenPhotosSpan: null,
  $ratingThreshSpin: null,

  busyFlag: true,
  refreshTmoutId: null,
  ownerId: 0,
  albumId: 0,
  friendMap: [],
  groupMap: [],
  ratedPhotos: [],
  albumMap: {},
  photosCount: 0,
  photosLoadedCnt: 0,
  photosFilteredCnt: 0,
  wallPostTipDisplayed: false,
  wallPostTipDisplayedKey: "wallPostTipDisplayed",

  goBtnLabelRating: "Рейтинг!",
  goBtnTooltipRating: "Составить рейтинг фотографий",
  goBtnLabelSave: "Сохранить на стену",
  goBtnTooltipSave: "Сохранить рейтинг на стену",
  EmptyIdGid: 0,

  init: function () {
    var self = RPApi;
    self.vkUserList = document.getElementById("vkUserList");
    self.vkGroupList = document.getElementById("vkGroupList");
    self.vkIdEdit = document.getElementById("vkIdEdit");
    self.albumListSel = document.getElementById("Form1_AlbumList");
    self.$progressBar = $("#Progressbar");
    self.$totalPhotosSpan = $("#totalPhotosNum");
    self.$ratedPhotosSpan = $("#ratedPhotosNum");
    self.$chosenPhotosSpan = $("#chosenPhotosNum");
    self.$ratingThreshSpin = $("#RatingThreshold");

    //assign event handlers
    $(self.vkUserList).change(self.onUserChangedEvent);
    $(self.vkIdEdit).change(self.onUidGidChanged);
    $(self.vkGroupList).change(self.onGroupChangedEvent);
    $(self.albumListSel).change(self.onAlbumChanged);
    $("#goButton").click(self.onGoButtonClick);
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_openOrig);

    self.$ratingThreshSpin.on("spin", function (event, ui) {
      RPApi.onThreshSpinChange.call(self);
    });

    self.disableControls(1);
    self.busyFlag = true;

    VkAppUtils.welcomeCheck().done(function () {
      //show spinner if still busy when dialog is closed
      if (self.busyFlag) {
        Utils.showSpinner();
      }
    });

    Settings.likedThresh = Settings.DefaultLikesThresh;
    self.$ratingThreshSpin.spinner("value", Settings.likedThresh);

    //query information about application user
    var d0 = VkApiWrapper.queryUser({
      user_ids: Settings.vkUserId,
      fields: Settings.QueryUserFields
    }).done(function (me_) {
      var me = me_[0];
      //update user list select
      me.title = self.vkUserList.item(1).text;
      me.opt = self.vkUserList.item(1);
      me.opt.value = me.screen_name;
      //update friendMap: screen_name -> user_info
      self.friendMap[me.screen_name] = me;
    });

    //query friends
    var d1 = VkApiWrapper.queryFriends({
      user_id: Settings.vkUserId,
      count: Settings.MaxFriendsList,
      fields: Settings.QueryUserFields
    }).done(function (friends) {
      //filter banned/inactive users
      friends = VkAppUtils.filterFriendList(friends.items);
      //populate user list select
      for (var i = 0; i < friends.length; i++) {
        friends[i].opt = new Option(friends[i].title, friends[i].screen_name, false, false);
        self.friendMap[friends[i].screen_name] = friends[i]; //update friendMap: screen_name -> user_info
        self.vkUserList.add(friends[i].opt, null);
      }
    });

    //query groups
    var d2 = VkApiWrapper.queryUserGroups({
      user_id: Settings.vkUserId,
      count: Settings.MaxFriendsList,
      extended: 1
    }).done(function (groups) {
      //filter banned/inactive groups
      groups = VkAppUtils.filterGroupList(groups.items);
      //populate group list select
      for (var i = 0; i < groups.length; i++) {
        groups[i].opt = new Option(groups[i].title, groups[i].screen_name, false, false);
        self.groupMap[groups[i].screen_name] = groups[i]; //update groupMap: screen_name -> group_info
        self.vkGroupList.add(groups[i].opt, null);
      }
    });

    //query notifications info
    VkApiWrapper.storageGet(self.wallPostTipDisplayedKey).done(function (data) {
      if (data[self.wallPostTipDisplayedKey]) {
        self.wallPostTipDisplayed = true;
      }
    });

    //when all info collected
    $.when(d0, d1, d2).done(function () {
      //url parameter when applicatiuon launched by a wall link
      var uidGid = Utils.sanitizeParameter(Utils.getParameterByName("uidGid", true));
      var albumId = Utils.sanitizeParameter(Utils.getParameterByName("albumId", true));

      function defaultInit() {
        //by default: select user itself in user list select
        self.vkUserList.selectedIndex = 1;
        self.onUserChanged().always(function () {
          self.busyFlag = false;
          Utils.hideSpinner();
          self.disableControls(0);
        });
      }

      //normal mode, initialization finished here
      if (!uidGid) {
        defaultInit();
        return;
      }

      //wall link mode
      //try resolve provided ID
      self.resolveUidGid(uidGid).fail(function () {
        //failed to resolve ID
        defaultInit();
      }).done(function () {
        //if uidGid was valid, start building photo rating automatically

        //try to find filter album by albumId
        if (albumId) {
          for (var j = 0; j < self.albumListSel.length; ++j) {
            if (self.albumListSel.item(j).value == albumId) {
              self.albumListSel.selectedIndex = j;
              break;
            }
          }
        }

        self.onGoButtonClick(true);
      });
    }).fail(function () {
      //initialization failed, disable controls
      self.busyFlag = false;
      Utils.hideSpinner();
      self.disableControls(1);
    });
  },

  onThumbClick_openOrig: function (event, parent) {
    var $this = $(this);
    var PluginName = 'ThumbsViewer';
    var $data = $this.data(PluginName);

    //open original VK image in a pop-up window
    var url = "//vk.com/photo" + $data.vk_img.owner_id + "_" + $data.vk_img.id;
    var myWindow = window.open(url, 'vk_photo', $("#ThumbsViewer").data(PluginName).VkPhotoPopupSettings, false);
    myWindow.focus();
  },

  onThumbClick_selectThumb: function (event, parent) {
    var $this = $(this);

    if (($("#ThumbsViewer").ThumbsViewer("getThumbsCount").selected < Settings.MaxSelectedThumbs) || ($this.hasClass("selected"))) {
      $("#ThumbsViewer").ThumbsViewer("selectToggle", $this);
    }
  },

  onUserChangedEvent: function () {
    var self = RPApi;

    self.disableControls(1);
    Utils.showSpinner();
    self.onUserChanged().always(function () {
      Utils.hideSpinner();
      self.disableControls(0);
    });
  },

  onGroupChangedEvent: function () {
    var self = RPApi;

    self.disableControls(1);
    Utils.showSpinner();
    self.onGroupChanged().always(function () {
      Utils.hideSpinner();
      self.disableControls(0);
    });
  },

  onAlbumChanged: function () {
    var self = RPApi;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
    $("#ThumbsViewer").off("click.RPApi", ".ThumbsViewer-thumb");
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_openOrig);
    $("#ThumbsViewer").ThumbsViewer("selectNone");

    self.updateRatingLink();
  },

  onUserChanged: function () {
    var self = RPApi;
    self.vkIdEdit.value = self.vkUserList.item(self.vkUserList.selectedIndex).value;
    self.vkGroupList.selectedIndex = 0;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
    $("#ThumbsViewer").off("click.RPApi", ".ThumbsViewer-thumb");
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_openOrig);
    $("#ThumbsViewer").ThumbsViewer("selectNone");
    Settings.likedThresh = Settings.DefaultLikesThresh;
    self.$ratingThreshSpin.spinner("value", Settings.likedThresh);

    if (self.vkUserList.selectedIndex) {
      self.ownerId = self.friendMap[self.vkIdEdit.value].id;
      $("#goButton").button("enable");
    } else {
      self.ownerId = self.EmptyIdGid;
      $("#goButton").button("disable");
    }

    return self.updateAlbumListBox();
  },

  onGroupChanged: function () {
    var self = RPApi;
    self.vkIdEdit.value = self.vkGroupList.item(self.vkGroupList.selectedIndex).value;
    self.vkUserList.selectedIndex = 0;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
    $("#ThumbsViewer").off("click.RPApi", ".ThumbsViewer-thumb");
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_openOrig);
    $("#ThumbsViewer").ThumbsViewer("selectNone");
    Settings.likedThresh = Settings.DefaultLikesThresh;
    self.$ratingThreshSpin.spinner("value", Settings.likedThresh);

    if (self.vkGroupList.selectedIndex) {
      self.ownerId = -self.groupMap[self.vkIdEdit.value].id;
      $("#goButton").button("enable");
    } else {
      self.ownerId = self.EmptyIdGid;
      $("#goButton").button("disable");
    }

    return self.updateAlbumListBox();
  },

  onUidGidChanged: function () {
    var self = RPApi;

    self.vkUserList.selectedIndex = 0;
    self.vkGroupList.selectedIndex = 0;
    self.ownerId = self.EmptyIdGid;
    self.updateAlbumListBox(); //effectively clean albums listbox

    $("#goButton").button("option", "label", self.goBtnLabelRating);
    $("#ThumbsViewer").off("click.RPApi", ".ThumbsViewer-thumb");
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_openOrig);
    $("#ThumbsViewer").ThumbsViewer("selectNone");

    if (!self.vkIdEdit.value.trim().length) {
      $("#goButton").button("disable");
      return;
    }

    self.disableControls(1);
    Utils.showSpinner();

    //resolve user/group
    self.resolveUidGid(self.vkIdEdit.value).always(function () {
      //already called onUserChanged/onGroupChanged at this point
      self.busyFlag = false;
      Utils.hideSpinner();
      self.disableControls(0);
    }).fail(function () {
      $("#goButton").button("disable");
    });
  },

  updateRatingLink: function () {
    var self = RPApi;
    var selIndex = self.albumListSel.selectedIndex;
    self.albumId = self.albumListSel.item(selIndex).value;
    var l = Settings.VkAppLocation + "?uidGid=" + self.vkIdEdit.value + "&albumId=" + self.albumId;
    $("#RatingLinkBox").text(l);
  },

  updateAlbumListBox: function (noSpinner) {
    var self = RPApi;
    var ddd = $.Deferred();
    var albums = [];

    function updateAlbumsListBox() {
      self.albumListSel.selectedIndex = 0;

      //remove old options, skip "not selected" option
      for (var i = self.albumListSel.length - 1; i >= 1; --i) {
        self.albumListSel.remove(i);
      }

      for (i = 0; i < albums.length; i++) {
        //put service albums to the beginning
        var index = null;
        if ((albums[i].owner_id > 0) && (albums[i].id == Settings.ProfileAlbumId)) {
          continue;
        } else if (albums[i].id < 0) {
          index = 1;
        }
        var opt = new Option(albums[i].title, albums[i].id, false, false);
        $(opt).data("RPApi", albums[i]);
        self.albumListSel.add(opt, index);
      }

      self.updateRatingLink();
    }

    if (self.ownerId != self.EmptyIdGid) {
      VkAppUtils.queryAlbumList({
        owner_id: self.ownerId,
        need_system: 1,
        album_ids: (self.ownerId < 0) ? Settings.WallAlbumId : ""
      }).done(function (resp) {
        albums = resp;
        updateAlbumsListBox();
        ddd.resolve();
      }).fail(function () {
        updateAlbumsListBox();
        ddd.reject();
      });
    } else {
      updateAlbumsListBox();
      ddd.resolve();
    }

    return ddd.promise();
  },

  onThreshSpinChange: function () {
    var self = RPApi;
    Settings.likedThresh = +self.$ratingThreshSpin.spinner("value");

    function refreshRating() {
      self.refreshTmoutId = null;
      if (!self.ratedPhotos.length) {
        return;
      }

      //remove all photos from container
      $("#ThumbsViewer").ThumbsViewer("empty");

      //make new list of photos based on current likes threshold
      var photos = self.filterPhotosByRating(self.ratedPhotos, Settings.likedThresh);
      if (!photos.length) {
        //if threshold was too high, lower it to see at least one photo
        Settings.likedThresh = self.ratedPhotos[0].likes.count;
        photos = self.filterPhotosByRating(self.ratedPhotos, Settings.likedThresh);
        self.$ratingThreshSpin.spinner("value", Settings.likedThresh);
      }
      self.$chosenPhotosSpan.text(photos.length);

      //add photos to the container
      $("#ThumbsViewer").ThumbsViewer("updateAlbumMap", self.albumMap);
      $("#ThumbsViewer").ThumbsViewer("addThumbList", photos);
    }

    //cancell previously schedulled refreshRating()
    if (self.refreshTmoutId) {
      clearTimeout(self.refreshTmoutId);
    }

    //schedule/reschedule refreshRating()
    self.refreshTmoutId = setTimeout(refreshRating, Settings.RatingRefreshDelay);
  },

  disableControls: function (disable) {
    var self = RPApi;
    var dval = 0;
    var dstr = "enable";
    if (disable) {
      dval = 1;
      dstr = "disable";
    }

    $("#goButton").button(dstr);
    self.vkIdEdit.disabled = dval;
    self.vkUserList.disabled = dval;
    self.vkGroupList.disabled = dval;
    self.albumListSel.disabled = dval;
    self.$ratingThreshSpin.spinner(dstr);
  },

  onGoButtonClick: function (noSpinner) {
    var self = RPApi;

    //save search result on user's wall
    if ($("#goButton").button("option", "label") == self.goBtnLabelSave) {
      self.wallPostResults();
      return;
    }

    //make rating

    //cleanup
    self.disableControls(1);

    $("#ThumbsViewer").ThumbsViewer("empty");
    self.$progressBar.progressbar("value", 0);
    self.$totalPhotosSpan.text("0");
    self.$chosenPhotosSpan.text("0");
    self.$ratedPhotosSpan.text("0");
    self.ratedPhotos = [];
    self.photosLoadedCnt = 0;
    self.photosFilteredCnt = 0;
    Settings.likedThresh = +self.$ratingThreshSpin.spinner("value");
    self.busyFlag = true;

    //don't show spinner when welcome dialog is active
    if (!noSpinner)
      Utils.showSpinner();

    function onAlways() {
      self.disableControls(0);
      self.busyFlag = false;
      Utils.hideSpinner();
    }

    var selIndex = self.albumListSel.selectedIndex;
    self.albumId = self.albumListSel.item(selIndex).value;
    if (selIndex > 0) { //rating by selected album
      self.collectAlbumPhotosRating().done(function () {
        self.showRating().always(onAlways);
      }).fail(onAlways);
    } else { //no album filter, do all photos rating
      self.collectAllPhotosRating().done(function () {
        self.showRating().always(onAlways);
      }).fail(onAlways);
    }
  },

  showRating: function () {
    var self = RPApi;
    var ddd = $.Deferred();

    //sort by rating and trim
    self.ratedPhotos = self.sortPhotosByRating(self.ratedPhotos);
    self.$ratedPhotosSpan.text(self.ratedPhotos.length);
    if (self.ratedPhotos.length > Settings.MaxRatedPhotos) {
      self.ratedPhotos = self.ratedPhotos.slice(0, Settings.MaxRatedPhotos);
    }

    //no rated photos found
    if (!self.ratedPhotos.length) {
      self.displayError("Не удалось составить рейтинг! Не найдено фотографий, с рейтингом выше 1");
      ddd.reject();
      return ddd.promise();
    }

    //for collected photos request a map: album_id -> album_title
    VkAppUtils.queryAlbumsInfo(self.ownerId, self.ratedPhotos).done(function (albumMap) {
      //all data has been requested at this point
      self.$progressBar.progressbar("value", 100);

      //push album map to ThumbsViewer, map will be used for image captions
      self.albumMap = albumMap;
      $("#ThumbsViewer").ThumbsViewer("updateAlbumMap", self.albumMap);

      //filter photos by rating threshold
      var photos = self.filterPhotosByRating(self.ratedPhotos, Settings.likedThresh);

      if (!photos.length) {
        //if threshold was too high, lower it to see at least one photo
        Settings.likedThresh = self.ratedPhotos[0].likes.count;
        photos = self.filterPhotosByRating(self.ratedPhotos, Settings.likedThresh);
        self.$ratingThreshSpin.spinner("value", Settings.likedThresh);
      } else {
        //update liked thresh to actual value
        Settings.likedThresh = self.ratedPhotos[self.ratedPhotos.length - 1].likes.count;
        self.$ratingThreshSpin.spinner("value", Settings.likedThresh);
      }

      //push photos to ThumbsViewer
      self.$chosenPhotosSpan.text(photos.length);
      $("#ThumbsViewer").ThumbsViewer("addThumbList", photos).done(function () {
        //job is done!
        ddd.resolve();

        //if rating was not empty, ask user to rate application
        //and enable "share" button
        if (photos.length > 10) {
          VkAppUtils.rateRequest(Settings.RateRequestDelay).done(function () {
            if ((!self.wallPostTipDisplayed)) {
              self.displayNote("<strong>Совет:</strong> Щелчком мыши можно выделить до " + Settings.MaxSelectedThumbs + " лучших фотографий, чтобы сохранить себе на стену.", Settings.NoteHideAfter);
              self.wallPostTipDisplayed = true;
              VkApiWrapper.storageSet(self.wallPostTipDisplayedKey, "1");
            }
          });
        }

        $("#goButton").button("option", "label", self.goBtnLabelSave);
        $("#ThumbsViewer").off("click.RPApi", ".ThumbsViewer-thumb");
        $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", self.onThumbClick_selectThumb);
      });
    }).fail(function () {
      ddd.reject();
    });

    return ddd.promise();
  },

  collectAllPhotosRating: function () {
    var self = RPApi;
    var ddd = $.Deferred();

    function onProgress(p, q) {
      self.updateProgress(p, q);
    }

    function pushPhotos(photos) {
      self.ratedPhotos = self.ratedPhotos.concat(photos);
    }

    function filterFn(photos) {
      return self.filterPhotosByRating(photos, 1);
    }

    //request total number of photos for progress reporting purpose
    VkAppUtils.getTotalPhotosCount(self.ownerId).done(function (count) {
      self.photosCount = count;
      self.$totalPhotosSpan.text(count);

      //no photos, nothing to do
      if (!self.photosCount) {
        ddd.resolve();
        return;
      }

      //query photos from all albums and from service albums
      var d1 = self.queryAllRatedPhotos(self.ownerId, 0, Settings.MaxTotalPhotos, 1);
      var d2 = VkAppUtils.queryAlbumPhotos(self.ownerId, 'saved', 0, Settings.MaxTotalPhotos, filterFn);
      var d3 = VkAppUtils.queryAlbumPhotos(self.ownerId, 'wall', 0, Settings.MaxTotalPhotos, filterFn);
      var d4 = VkAppUtils.queryAlbumPhotos(self.ownerId, 'profile', 0, Settings.MaxTotalPhotos, filterFn);

      d1.progress(onProgress).done(pushPhotos);
      d2.progress(onProgress).done(pushPhotos);
      d3.progress(onProgress).done(pushPhotos);
      d4.progress(onProgress).done(pushPhotos);

      //when all photos have been retreived
      $.when(d1, d2, d3, d4).fail(function () {
        ddd.reject();
      }).done(function () {
        ddd.resolve();
      });
    }).fail(function () {
      ddd.reject();
    });

    return ddd.promise();
  },

  collectAlbumPhotosRating: function () {
    var self = RPApi;
    var ddd = $.Deferred();

    function onProgress(p, q) {
      self.updateProgress(p, q);
    }

    function filterFn(photos) {
      return self.filterPhotosByRating(photos, 1);
    }

    //request total number of photos for progress reporting purpose
    VkApiWrapper.queryPhotos({
      owner_id: self.ownerId,
      album_id: self.albumId,
      offset: 0,
      count: 0
    }).done(function (rsp) {
      self.photosCount = rsp.count;
      self.$totalPhotosSpan.text(self.photosCount);

      //no photos, nothing to do
      if (!self.photosCount) {
        ddd.resolve();
        return;
      }

      //query photos from all albums and from service albums
      VkAppUtils.queryAlbumPhotos(self.ownerId, self.albumId, 0, Settings.MaxTotalPhotos, filterFn).progress(onProgress).done(function (photos) {
        self.ratedPhotos = self.ratedPhotos.concat(photos);
        ddd.resolve();
      }).fail(function () {
        ddd.reject();
      });
    }).fail(function () {
      ddd.reject();
    });

    return ddd.promise();
  },

  //update progress bar and rated photos number span
  updateProgress: function (p, q) {
    var self = RPApi;
    self.photosLoadedCnt += p;
    self.photosFilteredCnt += q;

    var progress = self.photosLoadedCnt / self.photosCount * 100;
    self.$progressBar.progressbar("value", progress);
    self.$ratedPhotosSpan.text(self.photosFilteredCnt);
  },

  //resolve user/group by screen_name
  resolveUidGid: function (str) {
    var self = RPApi;
    var ddd = $.Deferred();

    str = str.trim();

    //tries to use cached data(friendMap/groupMap) before requesting server
    if (str in self.friendMap) {
      self.vkUserList.selectedIndex = self.friendMap[str].opt.index;
      $.when(self.onUserChanged()).always(function () {
        ddd.resolve(self.friendMap[str], true);
      });
    } else if (str in self.groupMap) {
      self.vkGroupList.selectedIndex = self.groupMap[str].opt.index;
      $.when(self.onGroupChanged()).always(function () {
        ddd.resolve(self.groupMap[str], false);
      });
    } else {
      //provided screen_name was not found in local cache, requesting data from VK
      VkAppUtils.resolveUidGid(str).done(function (userGrp, isUser) {
        if (isUser) {
          //add new item to list select and cache
          userGrp.opt = new Option(userGrp.title, userGrp.screen_name, false, false);
          self.friendMap[userGrp.screen_name] = userGrp;
          self.vkUserList.add(userGrp.opt, 1);

          //make new item selected
          self.vkUserList.selectedIndex = 1;
          $.when(self.onUserChanged()).always(function () {
            ddd.resolve(userGrp, isUser);
          });
        } else {
          //add new item to list select and cache
          userGrp.opt = new Option(userGrp.title, userGrp.screen_name, false, false);
          self.groupMap[userGrp.screen_name] = userGrp;
          self.vkGroupList.add(userGrp.opt, 1);

          //make new item selected
          self.vkGroupList.selectedIndex = 1;
          $.when(self.onGroupChanged()).always(function () {
            ddd.resolve(userGrp, isUser);
          });
        }
      }).fail(function () {
        ddd.reject();
      });
    }

    return ddd.promise();
  },

  //post a link to the current rating to user wall
  //so friends can see the same rating when they open the application
  wallPostResults: function () {
    var self = RPApi;
    var message;
    var subj;

    //create message
    if (self.friendMap[self.vkIdEdit.value]) {
      //rating for me or other user
      subj = self.friendMap[self.vkIdEdit.value];
      if (subj.title == "Я") {
        message = 'Оцени мои лучшие фотографии в приложении "Рейтинг Фото"!';
      } else {
        message = 'Оцени лучшие фотографии ' + subj.first_name_gen + " " + subj.last_name_gen + ' в приложении "Рейтинг Фото"!';
      }
    } else if (self.groupMap[self.vkIdEdit.value]) {
      //rating for group/public/event
      subj = self.groupMap[self.vkIdEdit.value];
      var type = "группы";
      if (subj.type == "page") {
        type = "паблика";
      } else if (subj.type == "event") {
        type = "с мероприятия";
      }
      message = 'Оцени лучшие фотографии ' + type + ' "' + subj.title + '" в приложении "Рейтинг Фото"!';
    } else {
      //error!
      return;
    }

    //attach selected photos or attach first Settings.MaxSelectedThumbs photos
    var selectedCnt = $("#ThumbsViewer").ThumbsViewer("getThumbsCount").selected;
    var $thumbListm = $("#ThumbsViewer").ThumbsViewer("getThumbsData", selectedCnt > 0);
    $thumbListm = $thumbListm.slice(0, Settings.MaxSelectedThumbs);

    var attachments = "";
    var guid = "";
    for (var j = 0; j < $thumbListm.length; ++j) {
      attachments += "photo" + $thumbListm[j].data.vk_img.owner_id + "_" + $thumbListm[j].data.vk_img.id + ",";
      guid += $thumbListm[j].data.vk_img.id;
    }

    var link = Settings.VkAppLocation + "?uidGid=" + self.vkIdEdit.value + "&albumId=" + self.albumId;
    message += " " + link;
    //attachments += Settings.VkAppLocation + "_" + Settings.vkUserId + "?uidGid=" + self.vkIdEdit.value + "&albumId=" + self.albumId;

    //request to make a wall post
    VkApiWrapper.wallPost({
      friends_only: 0,
      message: message,
      attachments: attachments,
      guid: guid
    }, true);
  },

  filterPhotosByRating: function (photos, likedThresh) {
    var filtred = [];

    if (!photos) {
      return filtred;
    }

    for (var i = 0; i < photos.length; ++i) {
      if (photos[i].likes.count >= likedThresh) {
        filtred.push(photos[i]);
      }
    }

    return filtred;
  },

  //query photos from all public albums (except for service albums)
  //applies filterFn to each retreived chunk of photos
  //reports progress (photos retreived, photos left after filtering)
  queryAllRatedPhotos: function (ownerId, offset, maxCount, minLikes) {
    var self = this;
    var ddd = $.Deferred();
    var photos = [];

    function getNextChunk__(offset, countLeft) {
      var count = Math.min(countLeft, Settings.GetPhotosChunksSz);
      VkApiWrapper.queryAllRatedPhotos(ownerId, offset, count, minLikes).done(
        function (response) {
          if (!response.items) {
            response.items = [];
          }

          photos = photos.concat(response.items);
          photos = self.sortPhotosByRating(photos);
          photos = photos.slice(0, Settings.MaxRatedPhotos);
          minLikes = (photos.length == Settings.MaxRatedPhotos) ? photos[photos.length - 1].likes.count : minLikes;

          //report progress
          var progress = Math.min(count, response.count - offset);
          ddd.notify(progress, response.rated);

          offset = offset + progress;
          if ((offset < response.count) && (countLeft > 0)) {
            //request next chunk
            getNextChunk__(offset, countLeft - response.items.length);
          } else {
            //finally resolve with the list of retreived photos
            ddd.resolve(photos);
          }
        }
      ).fail(function (error) {
        ddd.reject(error);
      });
    }

    getNextChunk__(offset, maxCount);

    return ddd.promise();
  },

  sortPhotosByRating: function (photos) {
    function likedPhotosSortFn(a, b) {
      return b.likes.count - a.likes.count;
    }

    return photos.sort(likedPhotosSortFn);
  },

  displayError: function (errMsg) {
    //use global displayError(msg, errorBoxId)
    VkAppUtils.displayError(errMsg, "GlobalErrorBox", Settings.ErrorHideAfter);
  },

  displayNote: function (noteMsg, hideDelay) {
    if (!hideDelay) {
      VkAppUtils.displayNote(noteMsg, "NoteBox", Settings.NoteHideAfter);
    } else {
      VkAppUtils.displayNote(noteMsg, "NoteBox", hideDelay);
    }

  },

};

//Initialize application
$(function () {
  Settings.vkUserId = Utils.sanitizeParameter(Utils.getParameterByName("viewer_id"));
  Settings.vkSid = Utils.sanitizeParameter(Utils.getParameterByName("sid"));

  VkAppUtils.validateApp(Settings.vkSid, Settings.VkAppLocation, Settings.RedirectDelay);

  $("#ThumbsViewer").ThumbsViewer({
    disableSel: false
  });
  $("#Progressbar").progressbar({
    value: 0
  });
  $("#goButton").button();
  $("#goButton").button("enable");
  $("#welcome_dialog").dialog({
    autoOpen: false,
    show: {
      effect: "fade",
      duration: 1500
    },
    hide: true,
    modal: false,
    width: 600,
    position: {
      my: "center center-150",
      at: "center center",
      of: window
    }
  }).parent().addClass("glow");
  $("#rateus_dialog").dialog({
    autoOpen: false,
    show: {
      effect: "fade",
      duration: 1500
    },
    hide: true,
    width: 600,
    position: {
      my: "center center-150",
      at: "center center",
      of: window
    },
    modal: false
  }).parent().addClass("glow");
  $("#RatingThreshold").spinner({
    min: 1,
    step: 1,
    max: Settings.MaxLikeThresh
  });

  Utils.showSpinner();

  var d = $.Deferred();
  VK.init(
    function () {
      // API initialization succeeded
      VkApiWrapper.init({
        errorHandler: RPApi.displayError
      });

      //preloader AD
      /*if (typeof VKAdman !== 'undefined') {
        var app_id = 3231070; //
        var a = new VKAdman();
        a.setupPreroll(app_id);
        admanStat(app_id, Settings.vkUserId);
      }*/

      VK.Widgets.Like("vk_like", {
        type: "button",
        height: 24
      }, 500);
      d.resolve();
    },
    function () {
      // API initialization failed
      VkAppUtils.displayError("Не удалось инициализировать VK JS API! Попробуйте перезагрузить приложение.", "GlobalErrorBox");
      d.reject();
    },
    '5.131'
  );

  //VK API init finished: query user data
  d.done(function () {
    Utils.hideSpinner();
    RPApi.init();
  });
});
