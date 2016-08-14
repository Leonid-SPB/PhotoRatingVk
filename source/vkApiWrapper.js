/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires jQuery, utils(RateLimit, displayError), Vk API

var VkApiWrapper = {
	//allowed: 3 requests in 1000 ms
	apiMaxCallsCount  : 3,
	apiMaxCallsPeriod : 1000,
	apiCallTimeout    : 2000,
	apiCallMaxRetries : 4,
	apiTmoutMultiplier: 2.0,

	rateLimiter       : null,

	init              : function(apiMaxCallsCount, apiMaxCallsPeriod, apiCallTimeout, apiCallMaxRetries){
		this.apiMaxCallsCount = apiMaxCallsCount;
		this.apiMaxCallsPeriod = apiMaxCallsPeriod;
		this.apiCallTimeout = apiCallTimeout;
		this.apiCallMaxRetries = apiCallMaxRetries;
		this.rateLimiter = new RateLimit(this.apiMaxCallsCount, this.apiMaxCallsPeriod, false);
	},

	displayError      : function(errMsg) {
		//use global displayError(msg, errorBoxId)
		displayError(errMsg, "globalErrorBox");
	},

	//calls VK API method with specified parameters
	//returns Deferred.promise()
	callVkApi: function(vkApiMethod, methodParams) {
		var self = this;
		var d = $.Deferred();
		var retries = self.apiCallMaxRetries;
		var timeout = self.apiCallTimeout;
		
		function scheduleVkApiMethod() {
			self.rateLimiter.schedule(function() {
				setTimeout(function() {
					if (d.state() == "pending") {
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
				
				VK.api(vkApiMethod, methodParams, function(data) {
					//don't resolve/reject again on duplicate request
					if (d.state() != "pending") {
						return;
					}
					
					if ("response" in data) {
						d.resolve(data.response);
					} else {
						console.log(data.error.error_msg);
						d.reject(data.error);
					}
				});
			});
		}
		
		scheduleVkApiMethod();

		return d.promise();
	},

	queryAlbumsList: function(options) {
		var self = this;
		var p = this.callVkApi("photos.getAlbums", options);
		p.fail(function(){
			self.displayError("Не удалось получить список альбомов! Попробуйте перезагрузить приложение.");
		});
		return p;
	},

	queryPhotosList: function(options) {
		var self = this;
		var p = this.callVkApi("photos.get", options);
		p.fail(function(){
			self.displayError("Не удалось получить список фотографий из выбранного альбома! Попробуйте перезагрузить приложение.");
		});
		return p;
	},
	
	queryAllPhotosList: function(options) {
		var self = this;
		var p = this.callVkApi("photos.getAll", options);
		p.fail(function(){
			self.displayError("Не удалось получить список фотографий пользователя или группы! Попробуйте перезагрузить приложение.");
		});
		return p;
	},
	
	queryFriends: function(options) {
		var self = this;
		var p = this.callVkApi("friends.get", options);
		p.fail(function(){
			self.displayError("Не удалось получить список друзей! Попробуйте перезагрузить приложение.");
		});
		return p;
	},
	
	queryGroupsList: function(options){
		var self = this;
		var p = this.callVkApi("groups.get", options);
		p.fail(function(){
			self.displayError("Не удалось получить список групп пользователя! Попробуйте перезагрузить приложение.");
		});
		return p;
	},

	movePhoto: function(ownerId, targetAlbumId, photoId){
		var self = this;
		var p = this.callVkApi("photos.move", {owner_id: ownerId, target_album_id: targetAlbumId, photo_id: photoId});
		p.fail(function(){
			self.displayError("Не удалось переместить фотографию! Попробуйте перезагрузить приложение.");
		});
		return p;
	},

	storageGet: function(key){
		return this.callVkApi("storage.get", {key: key});
	},

	storageSet: function(key, value){
		return this.callVkApi("storage.set", {key: key, value: value});
	},
	
	
	validateApp: function(vkSid, appLocation, delay){
		if( vkSid ){//looks like a valid run
			return;
		}
		
		setTimeout(function (){
			document.location.href = appLocation;
		}, delay);
	},

	welcomeCheck: function () {
		//request isWelcomed var
		var isWelcomedKey = "isWelcomed3";
		VkApiWrapper.storageGet(isWelcomedKey).done( function(data) {
			if( data == "1"){//already welcomed
				return;
			}

			//if not welcomed yet -> show welcome dialog
			$( "#welcome_dialog" ).dialog( "open" );
			VkApiWrapper.storageSet(isWelcomedKey, "1");
		});
	},

	rateRequest: function (delay) {
		var isRatedKey = "isRated3";
		
		setTimeout( function() {
			VkApiWrapper.storageGet(isRatedKey).done( function(data) {
				if( data == "1"){//already rated
					return;
				}

				//if not rated yet -> show rate us dialog
				$( "#rateus_dialog" ).dialog( "open" );
				VkApiWrapper.storageSet(isRatedKey, "1");

				setTimeout(function(){blinkDiv("vk_like", Settings.blinkCount, Settings.blinkDelay);}, 1500);
			});
		}, delay);
	}
};
