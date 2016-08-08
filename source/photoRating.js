/** Copyright (c) 2013-2016 Leonid Azarenkov
    Licensed under the MIT license
*/

//requires VkApiWrapper, jQuery, highslide, spin.js

var Settings = {
	VkAppLocation   : "//vk.com/app3337781",
	VkApiDelay      : 340,
	GetPhotosCunksSz: 100,
	ErrorHideAfter  : 3000,
	MaxRatedPhotos  : 10000,
	RateRequestDelay: 3000,
	BlinkDelay      : 500,
	BlinkCount      : 12,
	RedirectDelay   : 3000,
	
	vkUserId        : null,
	vkSid           : null,
	likedThresh     : 1,
	
	VkPhotoPopupSettings: 'toolbar=yes,scrollbars=yes,resizable=yes,width=1024,height=600',
	AddThumbDelay       : 250
};

function showInviteBox(){
	VK.callMethod("showInviteBox");
}

function getAllPhotosChunk(ownerID, offset, count){
	var d = $.Deferred();
	VK.api("photos.getAll", {owner_id: ownerID, offset: offset, count: count, extended: 1}, function(data) {
		if(data.response){
			d.resolve(data.response.slice(1));
		}else{
			displayError("Не удалось получить фотографии.", "globalErrorBox", Settings.ErrorHideAfter);
			console.log(data.error.error_msg);
			d.reject();
		}
	});
	return d;
}

function getAllPhotosCount(ownerID){
	var d = $.Deferred();
	
	VK.api("photos.getAll", {owner_id: ownerID, count: 0}, function(data) {
		if(data.response){
			d.resolve(data.response[0]);
		}else{
			displayError("Не удалось получить общее количество фотографий.", "globalErrorBox", Settings.ErrorHideAfter);
			console.log(data.error.error_msg);
			d.reject();
		}
	});
	
	return d;
}

function queryFriends(userId){
	var d = $.Deferred();
	VK.api("friends.get", {uid: userId, fields: "uid, first_name, last_name", order: "name"}, function(data) {
		if(data.response){
			d.resolve(data.response);
		}else{
			displayError("Не удалось получить список друзей.", "globalErrorBox", Settings.ErrorHideAfter);
			console.log(data.error.error_msg);
			d.reject();
		}
	});
	return d;
}

function queryGroups(userId){
	var d = $.Deferred();
	VK.api("groups.get", {uid: userId, extended: 1}, function(data) {
		if(data.response){
			d.resolve(data.response.slice(1));
		}else{
			displayError("Не удалось получить список групп.", "globalErrorBox", Settings.ErrorHideAfter);
			console.log(data.error.error_msg);
			d.reject();
		}
	});
	return d;
}

function fillFriendsListBox(friends, listBoxId){
	var listSelect = document.getElementById(listBoxId);
	
	for(var i = 0; i < friends.length; i++){
		var opt = new Option(friends[i].first_name + " " + friends[i].last_name, friends[i].uid, false, false);
		listSelect.add(opt, null);
	}
}

function fillGroupsListBox(groups, listBoxId){
	var listSelect = document.getElementById(listBoxId);
	
	for(var i = 0; i < groups.length; i++){
		var opt = new Option(groups[i].name, groups[i].gid, false, false);
		listSelect.add(opt, null);
	}
}

function validateApp(vkSid, appLocation, delay){
	if( vkSid ){//looks like a valid run
		return;
	}
	
	setTimeout(function (){
		document.location.href = appLocation;
	}, delay);
}

var MBPhApi = {
	$progressBar: null,
	vkUserList: null,
	vkGroupList: null,
	vkIdEdit: null,
	$totalPhotosSpan: null,
	$ratedPhotosSpan: null,
	$chosenPhotosSpan: null,
	$ratingThreshSpin: null,
	
	ratedPhotos: [],
	photosCount: 0,
	
	init: function(){
		this.vkUserList = document.getElementById("vkUserList");
		this.vkGroupList = document.getElementById("vkGroupList");
		this.vkIdEdit = document.getElementById("vkIdEdit");
		this.$progressBar = $("#Progressbar");
		this.$totalPhotosSpan = $("#totalPhotosNum");
		this.$ratedPhotosSpan = $("#ratedPhotosNum");
		this.$chosenPhotosSpan = $("#chosenPhotosNum");
		this.$ratingThreshSpin = $("#RatingThreshold");
		
		this.vkUserList.item(1).value = Settings.vkUserId;
		this.vkUserList.selectedIndex = 1;
		this.onUserChanged();
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
	
	onGoButton: function(){
		var self = this;
		var ownerId = +this.vkIdEdit.value;
		
		//disable controls
		self.disableControls(1);
		$("#thumbs_container").ThumbsViewer("empty");
		self.$chosenPhotosSpan.text("0");
		Settings.likedThresh = +self.$ratingThreshSpin.spinner("value");
		
		getAllPhotosCount(ownerId).done(function(count){
			self.photosCount = count;
			
			self.queryRatedPhotos(ownerId).done(function(){
				self.ratedPhotos = self.sortPhotosByRating(self.ratedPhotos);
				if( self.ratedPhotos.length > Settings.MaxRatedPhotos ){
					self.ratedPhotos = self.ratedPhotos.slice(0, Settings.MaxRatedPhotos);
				}
				self.$chosenPhotosSpan.text(self.ratedPhotos.length);
				
				$("#thumbs_container").ThumbsViewer("addThumbList", self.ratedPhotos);
				self.disableControls(0);
				
				if( self.ratedPhotos.length > 10 ){
					setTimeout(function(){
						self.rateRequest();
					}, Settings.RateRequestDelay);
				}else if ( !self.ratedPhotos.length ){ //no photos found
					displayError("Не удалось составить рейтинг! Не найдено фотографий, с рейтингом выше " + Settings.likedThresh, "globalErrorBox", Settings.ErrorHideAfter);
				}
			}).fail(function(){
				self.disableControls(0);
			});
		}).fail(function(){
			self.disableControls(0);
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
		
		function getNextChunk__(offset, total) {
			if( offset >= total){//done
				ddd.resolve();
				return;
			}
			
			getAllPhotosChunk(ownerId, offset, Settings.GetPhotosCunksSz).done( function(photos) {
				var ratedPhotos = self.filterPhotos(photos, Settings.likedThresh);
				self.ratedPhotos = self.ratedPhotos.concat(ratedPhotos);
				
				self.updateProgress(offset + photos.length);

				setTimeout(function(){
					getNextChunk__(offset + Settings.GetPhotosCunksSz, total);
				}, Settings.VkApiDelay);
			}).fail(function(){
				ddd.reject();
			});
		}
		
		getNextChunk__(0, self.photosCount);
		
		return ddd;
	},
	
	welcomeCheck: function () {
		//request isWelcomed var
		VK.api("storage.get", {key: "isWelcomed"}, function(data) {
			if(data.response !== undefined){
				if( data.response == "1"){//already welcomed
					return;
				}
				
				//if not welcomed yet -> show welcome dialog
				$( "#welcome_dialog" ).dialog( "open" );
				VK.api("storage.set", {key: "isWelcomed", value: "1"});
			}else{
				console.log(data.error.error_msg);
			}
		});
	},
	
	rateRequest: function () {
		VK.api("storage.get", {key: "isRated"}, function(data) {
			if(data.response !== undefined){
				if( data.response == "1"){//already rated
					return;
				}
				
				//if not rated yet -> show rate us dialog
				$( "#rateus_dialog" ).dialog( "open" );
				VK.api("storage.set", {key: "isRated", value: "1"});
				
				var BlinkerDelay = 1500;
				setTimeout(function(){blinkDiv("vk_like", Settings.BlinkCount, Settings.BlinkDelay);}, BlinkerDelay);
			}else{
				console.log(data.error.error_msg);
			}
		});
	}
};

//init
(function (){
	$(document).ready( function(){
		Settings.vkUserId = getParameterByName("viewer_id");
		Settings.vkSid    = getParameterByName("sid");

		validateApp(Settings.vkSid, Settings.VkAppLocation, Settings.RedirectDelay);
		
		$("#thumbs_container").ThumbsViewer({AddThumbDelay: Settings.AddThumbDelay, VkPhotoPopupSettings: Settings.VkPhotoPopupSettings, disableSel: true});
		$("#Progressbar").progressbar({
			value: 0
		});
		$("#goButton").button();
		$("#goButton").button("enable");
		$( "#welcome_dialog" ).dialog({autoOpen: false, modal: true, width: 550, position: { my: "center center-150", at: "center center", of: window }});
		$( "#rateus_dialog" ).dialog({autoOpen: false, modal: false});
		
		$("#RatingThreshold").spinner({ min: 1, step: 1, max: 100});
		
		MBPhApi.init();		
		showSpinner();
		
		var d1 = $.Deferred();
		queryFriends(Settings.vkUserId).done(function(friends){
			fillFriendsListBox(friends, "vkUserList");
			d1.resolve();
		});
		
		var d2 = $.Deferred();
		queryGroups(Settings.vkUserId).done(function(friends){
			fillGroupsListBox(friends, "vkGroupList");
			d2.resolve();
		});
		
		$.when(d1, d2).done(function(){
			hideSpinner();
			MBPhApi.welcomeCheck();
		});
		
		VK.init(function() {
			//VK init done!
			VK.Widgets.Like("vk_like", {type: "button", height: 24}, 500);
		});
	});
})();