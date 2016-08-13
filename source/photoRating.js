/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires VkApiWrapper, jQuery, highslide, spin.js

var Settings = {
	VkAppLocation       : "//vk.com/app3337781",
	VkApiMaxCallsCount  : 3,
	VkApiMaxCallsPeriod : 1000,
	GetPhotosCunksSz: 100,
	ErrorHideAfter  : 3000,
	MaxRatedPhotos  : 10000,
	RateRequestDelay: 3000,
	BlinkDelay      : 500,
	BlinkCount      : 12,
	RedirectDelay   : 3000,
	MaxGroupNameLen : 40,
	MaxFriendsList  : 1000,
	
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
	
	ratedPhotos      : [],
	albumMap         : {},
	photosCount      : 0,
	
	init: function(){
		var self = this;
		this.vkUserList        = document.getElementById("vkUserList");
		this.vkGroupList       = document.getElementById("vkGroupList");
		this.vkIdEdit          = document.getElementById("vkIdEdit");
		this.$progressBar      = $("#Progressbar");
		this.$totalPhotosSpan  = $("#totalPhotosNum");
		this.$ratedPhotosSpan  = $("#ratedPhotosNum");
		this.$chosenPhotosSpan = $("#chosenPhotosNum");
		this.$ratingThreshSpin = $("#RatingThreshold");
		
		this.vkUserList.item(1).value = Settings.vkUserId;
		this.vkUserList.selectedIndex = 1;
		this.onUserChanged();
		
		showSpinner();
		var d1 = VkApiWrapper.queryFriends({user_id: Settings.vkUserId, order: "name", count: Settings.MaxFriendsList, fields: "first_name,last_name"}).done(function(friends){
			for(var i = 0; i < friends.items.length; i++){
				var opt = new Option(friends.items[i].first_name + " " + friends.items[i].last_name, friends.items[i].id, false, false);
				self.vkUserList.add(opt, null);
			}
		});
		
		var d2 = VkApiWrapper.queryGroupsList({user_id: Settings.vkUserId, extended: 1}).done(function(groups){
			self.fillGroupsListBox(groups, vkGroupList);
		});
		
		$.when(d1, d2).done(function(){
			hideSpinner();
			VkApiWrapper.welcomeCheck();
		});
	},
	
	onUserChanged: function(){
		this.vkIdEdit.value = this.vkUserList.item(this.vkUserList.selectedIndex).value;
		this.vkGroupList.selectedIndex = 0;
	},
	
	onGroupChanged: function(){
		if(this.vkGroupList.selectedIndex == 0){
			this.vkIdEdit.value = "";
		}else{
			this.vkIdEdit.value = -this.vkGroupList.item(this.vkGroupList.selectedIndex).value;
		}
		this.vkUserList.selectedIndex = 0;
	},
	
	onIdGidChanged: function(){
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
	

	fillGroupsListBox: function(groups, listSelect) {
		groups.items = groups.items.sort(function(a, b){
			var ta = a.name.toLowerCase();
			var tb = b.name.toLowerCase();
			if(ta < tb){
				return -1;
			}else if(ta > tb){
				return 1;
			}
			return 0;
		});
		
		for(var i = 0; i < groups.items.length; i++){
			var title = $("<div>").html(groups.items[i].name).text();//to convert escape sequences (&amp;, &quot;...) to chars
			if(title.length > Settings.MaxGroupNameLen){
				title = title.substring(0, Settings.MaxGroupNameLen) + "...";
			}
			var opt = new Option(title, -groups.items[i].id, false, false);//NOTE: using minus for group ID
			listSelect.add(opt, null);
		}
	},
	
	onGoButton: function(){
		var self = this;
		var ownerId = +this.vkIdEdit.value;
		
		//disable controls
		self.disableControls(1);
		$("#thumbs_container").ThumbsViewer("empty");
		self.$chosenPhotosSpan.text("0");
		Settings.likedThresh = +self.$ratingThreshSpin.spinner("value");
		showSpinner();
		
		VkApiWrapper.queryAllPhotosList({owner_id: ownerId, offset: 0, count: 0}).done(function(response){
			self.photosCount = response.count;
			
			self.queryRatedPhotos(ownerId).done(function(){
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
				
				self.queryAlbumInfo(ownerId, self.ratedPhotos).done(function(){
					hideSpinner();
					$("#thumbs_container").ThumbsViewer("addThumbList", self.ratedPhotos, false, self.albumMap);
					self.disableControls(0);
					
					if( self.ratedPhotos.length > 10 ){
						VkApiWrapper.rateRequest(Settings.RateRequestDelay);
					}
				}).fail(function(){
					self.disableControls(0);
					hideSpinner();
				});
			}).fail(function(){
				self.disableControls(0);
				hideSpinner();
			});
		}).fail(function(){
			self.disableControls(0);
			hideSpinner();
		});
	},
	
	updateProgress: function(p){
		var progress = 0;
		
		if(this.photosCount){
			progress = (p/this.photosCount)*100;
		}
		
		this.$progressBar.progressbar("value", progress);
		
		this.$totalPhotosSpan.text(this.photosCount);
		this.$ratedPhotosSpan.text(this.ratedPhotos.length);
	},
	
	filterPhotos: function(photos, likedThresh){
		var filtred = [];
		
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
	
	queryRatedPhotos: function(ownerId){
		var self = this;
		var ddd = $.Deferred();
		
		self.updateProgress(0);
		self.ratedPhotos = [];
		
		function getNextChunk__(offset) {
			if (offset >= self.photosCount){//done
				ddd.resolve();
				return;
			}
			VkApiWrapper.queryAllPhotosList({owner_id: ownerId, offset: offset, count: Settings.GetPhotosCunksSz, extended: 1, photo_sizes: 1}).done(
				function(photos) {
					var ratedPhotos = self.filterPhotos(photos.items, Settings.likedThresh);
					self.ratedPhotos = self.ratedPhotos.concat(ratedPhotos);
					
					self.updateProgress(offset + photos.items.length);
					getNextChunk__(offset + Settings.GetPhotosCunksSz);
				}
			).fail(function(){
				ddd.reject();
			});
		}
		
		getNextChunk__(0);
		
		return ddd;
	},
	
	queryAlbumInfo: function(ownerId, ratedPhotos) {
		var self = this;
		
		self.albumMap = {};
		for (var i = 0; i < ratedPhotos.length; ++i) {
			self.albumMap[ratedPhotos[i].album_id] = "";
		}
		
		var albumListStr = "";
		var keys = Object.keys(self.albumMap);
		for (var i = 0; i < keys.length-1; ++i) {
			albumListStr += keys[i] + ",";
		}
		albumListStr += albumListStr + keys[keys.length-1];
		
		var ddd = $.Deferred();
		VkApiWrapper.queryAlbumsList({owner_id: ownerId, album_ids: albumListStr}).done(function(response){
			for (var i = 0; i < response.count; ++i) {
				self.albumMap[response.items[i].id] = response.items[i].title;
			}
			
			ddd.resolve();
		}).fail(function(){
			ddd.reject();
		});
		
		return ddd;
	}
	

};

//Initialize application
var d = $.Deferred();
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

	VK.init(
		function() {
			// API initialization succeeded
			VkApiWrapper.init(Settings.VkApiMaxCallsCount, Settings.VkApiMaxCallsPeriod);
			
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
});

//VK API init finished: query user data
d.done(function(){
	hideSpinner();
	RPApi.init();
});
