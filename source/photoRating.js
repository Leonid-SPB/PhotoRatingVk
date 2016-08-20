/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires VkApiWrapper, jQuery, highslide, spin.js

var Settings = {
	VkAppLocation       : "//vk.com/app3337781",
	VkApiMaxCallsCount  : 3,
	VkApiMaxCallsPeriod : 1000,
	VkApiCallTimeout    : 2000,
	VkApiCallMaxRetries : 4,
	GetPhotosChunksSz: 100,
	ErrorHideAfter  : 3000,
	MaxRatedPhotos  : 1000,
	MaxTotalPhotos  : 1000000,
	RateRequestDelay: 3000,
	BlinkDelay      : 500,
	BlinkCount      : 12,
	RedirectDelay   : 3000,
	MaxGroupNameLen : 40,
	MaxFriendsList  : 500,
	
	vkUserId        : null,
	vkSid           : null,
	likedThresh     : 1,
	
	VkPhotoPopupSettings: 'toolbar=yes,scrollbars=yes,resizable=yes,width=1024,height=600',
	AddThumbDelay       : 250
};

function showInviteBox(){
	VK.callMethod("showInviteBox");
}

var RPApi = {
	$progressBar     : null,
	vkUserList       : null,
	vkGroupList      : null,
	vkIdEdit         : null,
	$totalPhotosSpan : null,
	$ratedPhotosSpan : null,
	$chosenPhotosSpan: null,
	$ratingThreshSpin: null,

	ownerId          : 0,
	friendMap        : [],
	groupMap         : [],
	ratedPhotos      : [],
	albumMap         : {},
	photosCount      : 0,
	photosLoadedCnt  : 0,
	photosFilteredCnt: 0,
	
	init: function(){
		var self = this;
		self.vkUserList        = document.getElementById("vkUserList");
		self.vkGroupList       = document.getElementById("vkGroupList");
		self.vkIdEdit          = document.getElementById("vkIdEdit");
		self.$progressBar      = $("#Progressbar");
		self.$totalPhotosSpan  = $("#totalPhotosNum");
		self.$ratedPhotosSpan  = $("#ratedPhotosNum");
		self.$chosenPhotosSpan = $("#chosenPhotosNum");
		self.$ratingThreshSpin = $("#RatingThreshold");

		self.disableControls(1);
		showSpinner();
		
		var d0 = VkApiWrapper.queryUser({user_ids: Settings.vkUserId, fields: "first_name,last_name,screen_name"}).done(function(me_) {
			me = me_[0];
			me.title = self.vkUserList.item(1).text;
			me.opt = self.vkUserList.item(1);
			me.opt.value = me.screen_name;
			self.friendMap[me.screen_name] = me;
		});
		
		var d1 = VkApiWrapper.queryFriends({user_id: Settings.vkUserId, count: Settings.MaxFriendsList, fields: "first_name,last_name,screen_name"}).done(function(friends) {
			friends = self.filterFriendList(friends.items);
			
			for(var i = 0; i < friends.length; i++){
				friends[i].opt = new Option(friends[i].title, friends[i].screen_name, false, false);
				self.friendMap[friends[i].screen_name] = friends[i];
				self.vkUserList.add(friends[i].opt, null);
			}
		});
		
		var d2 = VkApiWrapper.queryUserGroups({user_id: Settings.vkUserId, count: Settings.MaxFriendsList, extended: 1}).done(function(groups){
			groups = self.filterGroupList(groups.items);
			
			for(var i = 0; i < groups.length; i++){
				groups[i].opt = new Option(groups[i].title, groups[i].screen_name, false, false);
				self.groupMap[groups[i].screen_name] = groups[i];
				self.vkGroupList.add(groups[i].opt, null);
			}
		});
		
		
		$.when(d0, d1, d2).done(function() {
			var uidGid = getParameterByName("uidGid", true);
			
			if (!uidGid) {//normal mode
				self.vkUserList.selectedIndex = 1;
				self.onUserChanged();
				
				hideSpinner();
				self.disableControls(0);
				VkApiWrapper.welcomeCheck();
			
				return;
			}
			
			//wall link mode
			//try resolve provided ID
			self.vkIdEdit.value = uidGid;
			self.resolveUidGid(uidGid).always(function() {
				hideSpinner();
				self.disableControls(0);
				VkApiWrapper.welcomeCheck();
			});
		}).fail(function() {
			hideSpinner();
			self.disableControls(1);
		});
	},
	
	onUserChanged: function(){
		this.vkIdEdit.value = this.vkUserList.item(this.vkUserList.selectedIndex).value;
		this.vkGroupList.selectedIndex = 0;
	},
	
	onGroupChanged: function(){
		this.vkIdEdit.value = this.vkGroupList.item(this.vkGroupList.selectedIndex).value;
		this.vkUserList.selectedIndex = 0;
	},
	
	onUidGidChanged: function(){
		this.vkUserList.selectedIndex = 0;
		this.vkGroupList.selectedIndex = 0;
	},
	
	disableControls: function(disable){
		var self = this;
		var dval = 0;
		var dstr = "enable";
		if(disable){
			dval = 1;
			dstr = "disable";
		}
		
		$("#goButton").button(dstr);
		self.vkIdEdit.disabled = dval;
		self.vkUserList.disabled = dval;
		self.vkGroupList.disabled = dval;
		self.$ratingThreshSpin.spinner(dstr);
	},
	
	//remove deactivated, create title, sort alphabetically
	filterFriendList : function(friendList) {
		var friends = [];
		for(var i = 0; i < friendList.length; ++i) {
			if ("deactivated" in friendList[i]) {
				continue;
			}
			//to convert escape sequences (&amp;, &quot;...) to chars
			var title = $("<div>").html(friendList[i].first_name + " " + friendList[i].last_name).text();
			friendList[i].title = title;
			friends.push(friendList[i]);
		}
		
		friends = friends.sort(function(a, b) {
			var ta = a.title.toLowerCase();
			var tb = b.title.toLowerCase();
			if(ta < tb){
				return -1;
			}else if(ta > tb){
				return 1;
			}
			return 0;
		});
		
		return friends;
	},
	
	filterGroupList : function(groupList) {
		var groups = [];
		for(var i = 0; i < groupList.length; ++i) {
			if ("deactivated" in groupList[i]) {
				continue;
			}
			//to convert escape sequences (&amp;, &quot;...) to chars
			var title = $("<div>").html(groupList[i].name).text();
			if(title.length > Settings.MaxGroupNameLen){
				title = title.substring(0, Settings.MaxGroupNameLen) + "...";
			}
			groupList[i].title = title;
			groups.push(groupList[i]);
		}
		
		groups = groups.sort(function(a, b) {
			var ta = a.title.toLowerCase();
			var tb = b.title.toLowerCase();
			if(ta < tb){
				return -1;
			}else if(ta > tb){
				return 1;
			}
			return 0;
		});
		
		return groups;
	},
	
	resolveUidGid: function(str) {
		var self = this;
		var ddd = $.Deferred();
		
		str = str.trim();
		if (str in self.friendMap) {
			self.vkUserList.selectedIndex = self.friendMap[str].opt.index;
			self.onUserChanged();
			
			ddd.resolve(self.friendMap[str], true);
		} else if (str in self.groupMap) {
			self.vkGroupList.selectedIndex = self.groupMap[str].opt.index;
			self.onGroupChanged();
			
			ddd.resolve(self.groupMap[str], false);
		} else {
			self.resolveUidGid__(str).done(function (userGrp, isUser) {
				if (isUser) {
					userGrp.opt = new Option(userGrp.title, userGrp.screen_name, false, false);
					self.friendMap[userGrp.screen_name] = userGrp;
					
					self.vkUserList.add(userGrp.opt, 1);
					self.vkUserList.selectedIndex = 1;
					self.onUserChanged();
				} else {
					userGrp.opt = new Option(userGrp.title, userGrp.screen_name, false, false);
					self.groupMap[userGrp.screen_name] = userGrp;
					
					self.vkGroupList.add(userGrp.opt, 1);
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
	
	resolveUidGid__: function(str) {
		var self = this;
		var ddd = $.Deferred();

		function onFail() {
			self.displayError("Не удалось получить информацию о пользователе/группе: '" + str + "'");
			ddd.reject();
		}
		
		VkApiWrapper.resolveScreenName({screen_name: str}).done(function(resp) {
			if (!resp) {
				onFail();
				return;
			}
			
			if (resp.type == "user") {
				VkApiWrapper.queryUser({user_ids: resp.object_id, fields: "first_name,last_name,screen_name"}).done(function(friends) {
					friends = self.filterFriendList(friends);
					if(friends.length){
						ddd.resolve(friends[0], true);
					} else {
						onFail();
					}
				}).fail(onFail);
			} else if ((resp.type == "group") || (resp.type == "page")) {
				VkApiWrapper.queryGroup({group_ids: resp.object_id}).done(function(groups) {
					groups = self.filterGroupList(groups);
					if(groups.length){
						ddd.resolve(groups[0], false);
					} else {
						onFail();
					}
				}).fail(onFail);
			} else {
				onFail();
				return;
			}
			
		}).fail(onFail);
		
		return ddd;
	},
	
	onGoButton: function(){
		var self = this;
		
		self.disableControls(1);
		$("#thumbs_container").ThumbsViewer("empty");
		self.$progressBar.progressbar("value", 0);
		self.$totalPhotosSpan.text("0");
		self.$chosenPhotosSpan.text("0");
		self.$ratedPhotosSpan.text("0");
		self.ratedPhotos = [];
		self.photosLoadedCnt = 0;
		self.photosFilteredCnt = 0;
		Settings.likedThresh = +self.$ratingThreshSpin.spinner("value");
		showSpinner();
		
		function onFail() {
			self.disableControls(1);
			hideSpinner();
		}
		
		self.resolveUidGid(self.vkIdEdit.value).done(function (userGroup, isUser) {
			var ownerId = +userGroup.id;
			ownerId = isUser ? ownerId: -ownerId;//make negative ID for groups/pages
			
			function onProgress(p, q) {
				self.updateProgress(p, q);
			}
			
			function pushPhotos(photos) {
				self.ratedPhotos = self.ratedPhotos.concat(photos);
			}

			self.getTotalPhotosCount(ownerId).done(function(count) {
				self.photosCount = count;
				self.$totalPhotosSpan.text(count);
				var d1 = self.queryAllPhotos(ownerId, 0, Settings.MaxTotalPhotos);
				var d2 = self.queryAlbumPhotos(ownerId, 'saved', 0, Settings.MaxTotalPhotos);
				var d3 = self.queryAlbumPhotos(ownerId, 'wall', 0, Settings.MaxTotalPhotos);
				var d4 = self.queryAlbumPhotos(ownerId, 'profile', 0, Settings.MaxTotalPhotos);
				
				d1.progress(onProgress).fail(onFail).done(pushPhotos);
				d2.progress(onProgress).fail(onFail).done(pushPhotos);
				d3.progress(onProgress).fail(onFail).done(pushPhotos);
				d4.progress(onProgress).fail(onFail).done(pushPhotos);
				
				$.when(d1, d2, d3, d4).done(function() {
					self.ratedPhotos = self.sortPhotosByRating(self.ratedPhotos);
					if( self.ratedPhotos.length > Settings.MaxRatedPhotos ){
						self.ratedPhotos = self.ratedPhotos.slice(0, Settings.MaxRatedPhotos);
					}
					self.$chosenPhotosSpan.text(self.ratedPhotos.length);
					
					if ( !self.ratedPhotos.length ){ //no photos found
						hideSpinner();
						displayError("Не удалось составить рейтинг! Не найдено фотографий, с рейтингом выше " + Settings.likedThresh, "globalErrorBox", Settings.ErrorHideAfter);
						self.disableControls(0);
						return;
					}
					
					self.queryAlbumsInfo(ownerId, self.ratedPhotos).done(function() {
						self.$progressBar.progressbar("value", 100);
						hideSpinner();
						$("#thumbs_container").ThumbsViewer("updateAlbumMap", self.albumMap);
						$("#thumbs_container").ThumbsViewer("addThumbList", self.ratedPhotos);
						self.disableControls(0);
						
						if( self.ratedPhotos.length > 10 ){
							VkApiWrapper.rateRequest(Settings.RateRequestDelay);
						}
					}).fail(onFail);
				}).fail(onFail);
			}).fail(onFail);
		}).fail(onFail);
	},
	
	updateProgress: function(p, q) {
		this.photosLoadedCnt   += p;
		this.photosFilteredCnt += q;
		
		if (!this.photosLoadedCnt) {
			console.log("RPApi.updateProgress:: this.photosLoadedCnt == 0!");
			return;
		}
		
		var progress = this.photosLoadedCnt/this.photosCount*100;
		this.$progressBar.progressbar("value", progress);
		this.$ratedPhotosSpan.text(this.photosFilteredCnt);
	},
	
	filterPhotos: function(photos, likedThresh){
		var filtred = [];
		
		if (!photos) {
			return filtred;
		}
		
		for(var i = 0; i < photos.length; ++i){
			if(photos[i].likes.count >= likedThresh){
				filtred.push(photos[i]);
			}
		}
		
		return filtred;
	},
	
	sortPhotosByRating: function(photos){
		function likedPhotosSortFn(a, b){
			return b.likes.count - a.likes.count;
		}
		
		return photos.sort(likedPhotosSortFn);
	},
	
	getTotalPhotosCount: function(ownerId) {
		var self = this;
		var ddd = $.Deferred();
		var photosCount = 0;
		
		//showSpinner();
		
		var d1 = VkApiWrapper.queryAllPhotos({owner_id: ownerId, offset: 0, count: 0, no_service_albums: 1});
		var d2 = VkApiWrapper.queryPhotos({owner_id: ownerId, album_id: 'wall', offset: 0, count: 0});
		var d3 = VkApiWrapper.queryPhotos({owner_id: ownerId, album_id: 'saved', offset: 0, count: 0});
		var d4 = VkApiWrapper.queryPhotos({owner_id: ownerId, album_id: 'profile', offset: 0, count: 0});
		
		function updCnt(response) {
			photosCount += response.count;
		}
		
		d1.done(updCnt);
		d2.done(updCnt);
		d3.done(updCnt);
		d4.done(updCnt);
		
		$.when(d1, d2, d3, d4).done(function() {
			//hideSpinner();
			ddd.resolve(photosCount);
		}).fail(function() {
			//hideSpinner();
			ddd.reject();
		});

		return ddd.promise();
	},
	
	queryAllPhotos: function(ownerId, offset, maxCount){
		var self = this;
		var ddd = $.Deferred();
		var photos = [];
		
		function getNextChunk__(offset, countLeft) {
			var count = Math.min(countLeft, Settings.GetPhotosChunksSz);
			VkApiWrapper.queryAllPhotos({owner_id: ownerId, offset: offset, count: count, extended: 1, photo_sizes: 1, no_service_albums: 1}).done(
				function(response) {
					if(!response.items){
						response.items = [];
					}
					
					var photosFiltered = self.filterPhotos(response.items, Settings.likedThresh);
					photos = photos.concat(photosFiltered);
					
					ddd.notify(response.items.length, photosFiltered.length);
					
					if ((offset < response.count) && (countLeft > 0)) {
						getNextChunk__(offset + response.items.length, countLeft - response.items.length);
					} else {
						ddd.resolve(photos);
					}
				}
			).fail(function() {
				ddd.reject();
			});
		}
		
		getNextChunk__(offset, maxCount);
		
		return ddd.promise();
	},
	
	queryAlbumPhotos: function(ownerId, albumId, offset, maxCount){
		var self = this;
		var ddd = $.Deferred();
		var photos = [];
		
		function getNextChunk__(offset, countLeft) {
			var count = Math.min(countLeft, Settings.GetPhotosChunksSz);
			VkApiWrapper.queryPhotos({owner_id: ownerId, album_id: albumId, offset: offset, count: count, extended: 1, photo_sizes: 1, no_service_albums: 0}).done(
				function(response) {
					if(!response.items){
						response.items = [];
					}
					
					var photosFiltered = self.filterPhotos(response.items, Settings.likedThresh);
					photos = photos.concat(photosFiltered);
					
					ddd.notify(response.items.length, photosFiltered.length);
					
					if ((offset < response.count) && (countLeft > 0)) {
						getNextChunk__(offset + response.items.length, countLeft - response.items.length);
					} else {
						ddd.resolve(photos);
					}
				}
			).fail(function() {
				ddd.reject();
			});
		}
		
		getNextChunk__(offset, maxCount);
		
		return ddd.promise();

	},
	
	queryAlbumsInfo: function(ownerId, ratedPhotos) {
		var self = this;
		
		self.albumMap = {};
		for (var i = 0; i < ratedPhotos.length; ++i) {
			self.albumMap[ratedPhotos[i].album_id] = "";
		}
		
		var ddd = $.Deferred();
		var albumListStr = Object.keys(self.albumMap).join();
		VkApiWrapper.queryAlbums({owner_id: ownerId, album_ids: albumListStr}).done(function(response){
			for (var i = 0; i < response.count; ++i) {
				self.albumMap[response.items[i].id] = response.items[i].title;
			}
			
			ddd.resolve();
		}).fail(function(){
			ddd.reject();
		});
		
		return ddd.promise();
	}

};

//Initialize application
$(function(){
	Settings.vkUserId = getParameterByName("viewer_id");
	Settings.vkSid    = getParameterByName("sid");

	VkApiWrapper.validateApp(Settings.vkSid, Settings.VkAppLocation, Settings.RedirectDelay);
	
	$("#thumbs_container").ThumbsViewer({AddThumbDelay: Settings.AddThumbDelay, VkPhotoPopupSettings: Settings.VkPhotoPopupSettings, disableSel: true});
	$("#Progressbar").progressbar({
		value: 0
	});
	$("#goButton").button();
	$("#goButton").button("enable");
	$( "#welcome_dialog" ).dialog({autoOpen: false, modal: true, width: 550, position: { my: "center center-150", at: "center center", of: window }});
	$( "#rateus_dialog" ).dialog({autoOpen: false, modal: false});
	$("#RatingThreshold").spinner({ min: 1, step: 1, max: 100});
	
	showSpinner();

	var d = $.Deferred();
	VK.init(
		function() {
			// API initialization succeeded
			VkApiWrapper.init(Settings.VkApiMaxCallsCount, Settings.VkApiMaxCallsPeriod,
				Settings.VkApiCallTimeout, Settings.VkApiCallMaxRetries);
			
			//preloader AD
			/*if (typeof VKAdman !== 'undefined') {
				var app_id = 3231070; //
				var a = new VKAdman();
				a.setupPreroll(app_id);
				admanStat(app_id, Settings.vkUserId);
			}*/
			
			VK.Widgets.Like("vk_like", {type: "button", height: 24}, 500);
			d.resolve();
		},
		function(){
			// API initialization failed
			displayError("Не удалось инициализировать VK JS API! Попробуйте перезагрузить приложение.", "globalErrorBox");
			d.reject();
		},
		'5.53'
	);
	
	//VK API init finished: query user data
	d.done(function(){
		hideSpinner();
		RPApi.init();
	});
});
