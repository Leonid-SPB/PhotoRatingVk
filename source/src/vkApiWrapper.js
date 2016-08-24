/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires jQuery, utils(RateLimit, displayError), Vk API
/* globals $, RateLimit, displayError, blinkDiv, Settings, VK*/

var VkApiWrapper = {
  //allowed: 3 requests in 1000 ms
  apiMaxCallsCount: 3,
  apiMaxCallsPeriod: 1000,
  apiCallTimeout: 2000,
  errorHideAfter: 6000,
  apiCallMaxRetries: 4,
  apiTmoutMultiplier: 2.0,
  ApiErrCodes: {
    AccessDenied: 15,
    AlbumAccessDenied: 200
  },

  rateLimiter: null,

  init: function (apiMaxCallsCount, apiMaxCallsPeriod, apiCallTimeout, apiCallMaxRetries) {
    this.apiMaxCallsCount = apiMaxCallsCount;
    this.apiMaxCallsPeriod = apiMaxCallsPeriod;
    this.apiCallTimeout = apiCallTimeout;
    this.apiCallMaxRetries = apiCallMaxRetries;
    this.rateLimiter = new RateLimit(this.apiMaxCallsCount, this.apiMaxCallsPeriod, false);
  },

  displayError: function (errMsg) {
    //use global displayError(msg, errorBoxId)
    displayError(errMsg, "globalErrorBox", this.errorHideAfter);
  },

  //calls VK API method with specified parameters
  //returns Deferred.promise()
  callVkApi: function (vkApiMethod, methodParams) {
    var self = this;
    var d = $.Deferred();
    var retries = self.apiCallMaxRetries;
    var timeout = self.apiCallTimeout;

    function scheduleVkApiMethod() {
      self.rateLimiter.schedule(function () {
        setTimeout(function () {
          if (d.state() === "pending") {
            if (retries-- > 0) {
              console.log("VkApiWrapper: VK.api call timeout, rescheduling request");
              timeout *= self.apiTmoutMultiplier;
              scheduleVkApiMethod();
            } else {
              console.log("VkApiWrapper: VK.api call timeout, all retries failed");
              d.reject();
            }
          }

          //no timeout, api call already finished
        }, timeout);

        VK.api(vkApiMethod, methodParams, function (data) {
          //don't resolve/reject again on duplicate request
          if (d.state() !== "pending") {
            return;
          }

          if ("response" in data) {
            d.resolve(data.response);
          } else if ("error" in data) {
            console.log("VkApiWrapper: " + data.error.error_msg);
            d.reject(data.error);
          } else {
            console.log("VkApiWrapper: Unknow error!");
            d.reject(null);
          }
        });
      });
    }

    scheduleVkApiMethod();

    return d.promise();
  },

  queryAlbums: function (options, silent) {
    var self = this;
    var p = self.callVkApi("photos.getAlbums", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить список альбомов!");
      });
    }
    return p;
  },

  queryPhotos: function (options, silent) {
    var self = this;
    var d = $.Deferred();

    self.callVkApi("photos.get", options).done(function (response) {
      d.resolve(response);
    }).fail(function (error) {
      if (("error_code" in error) && ((error.error_code == self.ApiErrCodes.AccessDenied) ||
          (error.error_code == self.ApiErrCodes.AlbumAccessDenied))) { //handle access denied error, return empty data
        var resp = {
          items: [],
          count: 0
        };
        d.resolve(resp);
      } else {
        if (!silent) {
          self.displayError("Не удалось получить список фотографий из выбранного альбома!");
        }
        d.reject();
      }
    });

    return d;
  },

  queryAllPhotos: function (options, silent) {
    var self = this;
    var p = self.callVkApi("photos.getAll", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить список фотографий пользователя или группы!");
      });
    }
    return p;
  },

  queryFriends: function (options, silent) {
    var self = this;
    var p = self.callVkApi("friends.get", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить список друзей!");
      });
    }
    return p;
  },

  queryUser: function (options, silent) {
    var self = this;
    var p = self.callVkApi("users.get", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить информацию о пользователе!");
      });
    }
    return p;
  },

  queryUserGroups: function (options, silent) {
    var self = this;
    var p = self.callVkApi("groups.get", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить список групп пользователя!");
      });
    }
    return p;
  },

  queryGroup: function (options, silent) {
    var self = this;
    var p = self.callVkApi("groups.getById", options);
    if (!silent) {
      p.fail(function () {
        self.displayError("Не удалось получить информацию о группе/странице!");
      });
    }
    return p;
  },

  /*movePhoto: function(ownerId, targetAlbumId, photoId){
  	var self = this;
  	var p = self.callVkApi("photos.move", {owner_id: ownerId, target_album_id: targetAlbumId, photo_id: photoId});
  	if (!silent) {
  		p.fail(function(){
  			self.displayError("Не удалось переместить фотографию!");
  		});
  	}
  	return p;
  },*/

  resolveScreenName: function (options, silent) {
    var self = this;
    var p = self.callVkApi("utils.resolveScreenName", options);
    if (!silent) {
      p.fail(function () {
        var str = ("screen_name" in options) ? options.screen_name : 'undefined';
        self.displayError("Не удалось получить информацию о пользователе/группе: '" + str + "'");
      });
    }
    return p;
  },

  storageGet: function (key) {
    return this.callVkApi("storage.get", {
      key: key
    });
  },

  storageSet: function (key, value) {
    return this.callVkApi("storage.set", {
      key: key,
      value: value
    });
  },

  validateApp: function (vkSid, appLocation, delay) {
    if (vkSid) { //looks like a valid run
      return;
    }

    setTimeout(function () {
      document.location.href = appLocation;
    }, delay);
  },

  welcomeCheck: function () {
    //request isWelcomed var
    var isWelcomedKey = "isWelcomed3";
    VkApiWrapper.storageGet(isWelcomedKey).done(function (data) {
      if (data == "1") { //already welcomed
        //return;
      }

      //if not welcomed yet -> show welcome dialog
      $("#welcome_dialog").dialog("open");
      VkApiWrapper.storageSet(isWelcomedKey, "1");
    });
  },

  rateRequest: function (delay) {
    var isRatedKey = "isRated3";
    var BlinkAfterDialogDelay = 1500;

    setTimeout(function () {
      VkApiWrapper.storageGet(isRatedKey).done(function (data) {
        if (data == "1") { //already rated
          //return;
        }

        //if not rated yet -> show rate us dialog
        $("#rateus_dialog").dialog("open");
        VkApiWrapper.storageSet(isRatedKey, "1");

        setTimeout(function () {
          blinkDiv("vk_like", Settings.BlinkCount, Settings.BlinkDelay);
        }, BlinkAfterDialogDelay);
      });
    }, delay);
  }
};
