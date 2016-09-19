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
  BlinkDelay: 500,
  BlinkCount: 12,
  RedirectDelay: 3000,
  MaxGroupNameLen: 40,
  MaxFriendsList: 500,
  MaxLikeThresh: 1000,
  RatingRefreshDelay: 700,

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
  $totalPhotosSpan: null,
  $ratedPhotosSpan: null,
  $chosenPhotosSpan: null,
  $ratingThreshSpin: null,

  busyFlag: true,
  refreshTmoutId: null,
  ownerId: 0,
  friendMap: [],
  groupMap: [],
  ratedPhotos: [],
  albumMap: {},
  photosCount: 0,
  photosLoadedCnt: 0,
  photosFilteredCnt: 0,
  goBtnLabelRating: "Рейтинг!",
  goBtnTooltipRating: "Составить рейтинг фотографий",
  goBtnLabelSave: "Сохранить на стену",
  goBtnTooltipSave: "Сохранить рейтинг на стену",

  init: function () {
    var self = RPApi;
    self.vkUserList = document.getElementById("vkUserList");
    self.vkGroupList = document.getElementById("vkGroupList");
    self.vkIdEdit = document.getElementById("vkIdEdit");
    self.$progressBar = $("#Progressbar");
    self.$totalPhotosSpan = $("#totalPhotosNum");
    self.$ratedPhotosSpan = $("#ratedPhotosNum");
    self.$chosenPhotosSpan = $("#chosenPhotosNum");
    self.$ratingThreshSpin = $("#RatingThreshold");

    //assign event handlers
    $(self.vkUserList).change(self.onUserChanged);
    $(self.vkIdEdit).change(self.onUidGidChanged);
    $(self.vkGroupList).change(self.onGroupChanged);
    $("#goButton").click(self.onGoButtonClick);
    $("#ThumbsViewer").on("click.RPApi", ".ThumbsViewer-thumb", function (event, parent) {
      var $this = $(this);
      var PluginName = 'ThumbsViewer';
      var $data = $this.data(PluginName);

      //open original VK image in a pop-up window
      var url = "//vk.com/photo" + $data.vk_img.owner_id + "_" + $data.vk_img.id;
      var myWindow = window.open(url, 'vk_photo', $("#ThumbsViewer").data(PluginName).VkPhotoPopupSettings, false);
      myWindow.focus();
    });

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

    //when all info collected
    $.when(d0, d1, d2).done(function () {
      //url parameter when applicatiuon launched by a wall link
      var uidGid = Utils.sanitizeParameter(Utils.getParameterByName("uidGid", true));

      //by default: select user itself in user list select
      self.vkUserList.selectedIndex = 1;
      self.onUserChanged();

      if (!uidGid) {
        //normal mode, initialization finished
        self.busyFlag = false;
        Utils.hideSpinner();
        self.disableControls(0);
        return;
      }

      //wall link mode
      //try resolve provided ID
      self.resolveUidGid(uidGid).fail(function () {
        //failed to resolve ID
        self.busyFlag = false;
        Utils.hideSpinner();
        self.disableControls(0);
      }).done(function () {
        //if uidGid was valid, start building photo rating automatically
        self.onGoButtonClick(true);
      });
    }).fail(function () {
      //initialization failed, disable controls
      self.busyFlag = false;
      Utils.hideSpinner();
      self.disableControls(1);
    });
  },

  onUserChanged: function () {
    var self = RPApi;
    self.vkIdEdit.value = self.vkUserList.item(self.vkUserList.selectedIndex).value;
    self.vkGroupList.selectedIndex = 0;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
  },

  onGroupChanged: function () {
    var self = RPApi;
    self.vkIdEdit.value = self.vkGroupList.item(self.vkGroupList.selectedIndex).value;
    self.vkUserList.selectedIndex = 0;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
  },

  onUidGidChanged: function () {
    var self = RPApi;
    self.vkUserList.selectedIndex = 0;
    self.vkGroupList.selectedIndex = 0;
    $("#goButton").button("option", "label", self.goBtnLabelRating);
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
    self.$ratingThreshSpin.spinner(dstr);
  },

  onGoButtonClick: function (noSpinner) {
    var self = RPApi;

    //save search result on user's wall
    if ($("#goButton").button("option", "label") == self.goBtnLabelSave) {
      self.wallPostResults();
      return;
    }

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

    //default error handler
    //don't block the application so user can try again
    function onFail() {
      self.disableControls(0);
      self.busyFlag = false;
      Utils.hideSpinner();
    }

    //no screen name, make rating fou the user itself then
    if (!self.vkIdEdit.value) {
      self.vkUserList.selectedIndex = 1;
      self.onUserChanged();
    }

    //take screen_name from edit box and resolve user data
    self.resolveUidGid(self.vkIdEdit.value).done(function (userGroup, isUser) {
      var ownerId = +userGroup.id;
      ownerId = isUser ? ownerId : -ownerId; //make negative ID for groups/pages

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
      VkAppUtils.getTotalPhotosCount(ownerId).done(function (count) {
        self.photosCount = count;
        self.$totalPhotosSpan.text(count);

        //query photos from all albums and from service albums
        var d1 = self.queryAllRatedPhotos(ownerId, 0, Settings.MaxTotalPhotos, 1);
        var d2 = VkAppUtils.queryAlbumPhotos(ownerId, 'saved', 0, Settings.MaxTotalPhotos, filterFn);
        var d3 = VkAppUtils.queryAlbumPhotos(ownerId, 'wall', 0, Settings.MaxTotalPhotos, filterFn);
        var d4 = VkAppUtils.queryAlbumPhotos(ownerId, 'profile', 0, Settings.MaxTotalPhotos, filterFn);

        d1.progress(onProgress).fail(onFail).done(pushPhotos);
        d2.progress(onProgress).fail(onFail).done(pushPhotos);
        d3.progress(onProgress).fail(onFail).done(pushPhotos);
        d4.progress(onProgress).fail(onFail).done(pushPhotos);

        //when all photos have been retreived
        $.when(d1, d2, d3, d4).done(function () {
          //sort by rating and trim
          self.ratedPhotos = self.sortPhotosByRating(self.ratedPhotos);
          self.$ratedPhotosSpan.text(self.ratedPhotos.length);
          if (self.ratedPhotos.length > Settings.MaxRatedPhotos) {
            self.ratedPhotos = self.ratedPhotos.slice(0, Settings.MaxRatedPhotos);
          }

          //no rated photos found
          if (!self.ratedPhotos.length) {
            self.busyFlag = false;
            Utils.hideSpinner();
            self.displayError("Не удалось составить рейтинг! Не найдено фотографий, с рейтингом выше 1");
            self.disableControls(0);
            return;
          }

          //for collected photos request a map: album_id -> album_title
          VkAppUtils.queryAlbumsInfo(ownerId, self.ratedPhotos).done(function (albumMap) {
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
              self.busyFlag = false;
              Utils.hideSpinner();
              self.disableControls(0);

              //if rating was not empty, ask user to rate application
              //and enable "share" button
              if (photos.length > 10) {
                VkAppUtils.rateRequest(Settings.RateRequestDelay);
                $("#goButton").button("option", "label", self.goBtnLabelSave);
              }
            }).fail(onFail);
          }).fail(onFail);
        }).fail(onFail);
      }).fail(onFail);
    }).fail(onFail);
  },

  //update progress bar and rated photos number span
  updateProgress: function (p, q) {
    var self = RPApi;
    self.photosLoadedCnt += p;
    self.photosFilteredCnt += q;

    if (!self.photosLoadedCnt) {
      console.log("RPApi.updateProgress:: self.photosLoadedCnt == 0!");
      return;
    }

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
      self.onUserChanged();

      ddd.resolve(self.friendMap[str], true);
    } else if (str in self.groupMap) {
      self.vkGroupList.selectedIndex = self.groupMap[str].opt.index;
      self.onGroupChanged();

      ddd.resolve(self.groupMap[str], false);
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
          self.onUserChanged();
        } else {
          //add new item to list select and cache
          userGrp.opt = new Option(userGrp.title, userGrp.screen_name, false, false);
          self.groupMap[userGrp.screen_name] = userGrp;
          self.vkGroupList.add(userGrp.opt, 1);

          //make new item selected
          self.vkGroupList.selectedIndex = 1;
          self.onGroupChanged();
        }

        ddd.resolve(userGrp, isUser);
      }).fail(function () {
        ddd.reject();
      });
    }

    return ddd;
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

    var attachments = /*"photo-45558877_428286179," + */ Settings.VkAppLocation + "?uidGid=" + self.vkIdEdit.value;
    var guid = "app5597335-" + self.vkIdEdit.value;

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
          ddd.notify(progress, response.items.length);

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

};

//Initialize application
$(function () {
  Settings.vkUserId = Utils.sanitizeParameter(Utils.getParameterByName("viewer_id"));
  Settings.vkSid = Utils.sanitizeParameter(Utils.getParameterByName("sid"));

  VkAppUtils.validateApp(Settings.vkSid, Settings.VkAppLocation, Settings.RedirectDelay);

  $("#ThumbsViewer").ThumbsViewer({
    disableSel: true
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
    '5.53'
  );

  //VK API init finished: query user data
  d.done(function () {
    Utils.hideSpinner();
    RPApi.init();
  });
});
