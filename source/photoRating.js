/** Copyright (c) 2013-2016 Leonid Azarenkov
    Licensed under the MIT license
*/

//requires VkApiWrapper, jQuery, highslide, spin.js

var Settings = {
	vkUserId        : null,
	vkSid           : null,
	vkApiDelay      : 340,
	getPhotosCunksSz: 100,
	errorHideAfter  : 3000,
	likedThresh     : 1,
	maxRatedPhotos  : 10000,
	rateRequestDelay: 3000,
	blinkDelay      : 500,
	blinkCount      : 12,
	vkAppLocation   : "//vk.com/app3337781",
	redirectDelay   : 3000,
	
	vkPhotoPopupSettings: 'toolbar=yes,scrollbars=yes,resizable=yes,width=1024,height=600',
	addThumbDelay       : 250
};

/* Thumbs Container */
(function( $, hs ) {
	var defaults = {
		AddThumbDelay       : Settings.addThumbDelay,
		vkPhotoPopupSettings: Settings.vkPhotoPopupSettings
	};
	
	var methods = {
		init: function(opts) {
			var $this = $(this);
			var options = $.extend(defaults, opts);
			$this.addClass("ThumbsViewer-thumbs_container");
			$this.on("click.ThumbsViewer", ".ThumbsViewer-thumb_block", function(event){methods.onSelClick__.call(this, event, $this)});
			$this.on("click.ThumbsViewer", ".ThumbsViewer_zoom-ico", function(event){methods.onZoomClick__.call(this, event, $this)});
			
			var data = {
				disableSel: false,
				busy_dfrd : $.Deferred(),
				abort     : false,
				thumbsSelected: 0,
				revSortOrder: false
			};
			data.busy_dfrd.resolve();
			$this.data('ThumbsViewer', data);
		},
		
		//expects object img with property src
		addThumb: function(img) {
			var $this = $(this);
			var thumb_parent = $("<div></div>", {class: "ThumbsViewer-thumb_block loading"});
			
			var likesbox = '<div class="ui-state-default ThumbsViewer_likesBox ui-corner-br">&#10084; ' + img.likes.count + '</div>';
		
			var origUrl = "//vk.com/photo" + img.owner_id + "_" + img.pid;
			var onClickOrigUrl = "var myWindow = window.open('" + origUrl + "', 'vk_photo', '" + defaults.vkPhotoPopupSettings + "', false); myWindow.focus();";
			var captionStr = '&#10084; ' + img.likes.count + ', <a title="Оригинал фото" onclick="' + onClickOrigUrl + '">' + origUrl + '</a>';
			
			var aa = $("<a></a>", {href: img.src_big, title: 'Увеличить', onclick: 'return hs.expand(this, hs.config1)'}).data({caption: captionStr});
			var zoomIcon = $('<div class="ThumbsViewer_zoom-ico"></div>').append(aa);

			var thumb_img = $("<img />");
			thumb_img.load(function(){
				thumb_parent.removeClass('loading');
				thumb_parent.addClass('showphoto');
				thumb_parent.css('background-image', 'url(' + img.src + ')');
			});
			thumb_img.attr({src: img.src, title: "Открыть фото"});
			
			thumb_parent.append($(likesbox));
			thumb_parent.append(zoomIcon);
			thumb_parent.data('ThumbsViewer', {img: img});
			thumb_parent.appendTo($this);
		},
		
		removeThumb: function($thumb){
			if($thumb.hasClass("selected")){
				var data   = $(this).data('ThumbsViewer');
				--data.thumbsSelected;
			}
			$thumb.remove();
		},
		
		//thumbsAr is expected to be non empty array with elements containing .src property
		//returns Deferred which will be resolved when all thumbs are added to container or job is aborted
		addThumbList: function(thumbsAr, revSort){
			var d = $.Deferred();

			function addThumb__(self, thumbsAr, idx){
				var data   = $(self).data('ThumbsViewer');
				if(idx >= thumbsAr.length || data.abort){
					data.busy_dfrd.resolve();
					d.resolve();
					return;
				}
				
				methods.addThumb.call(self, thumbsAr[idx++]);
				setTimeout(function(){addThumb__(self, thumbsAr, idx);}, defaults.AddThumbDelay);
			}
			
			//abort prev job in progress
			var $this = $(this);
			var data   = $this.data('ThumbsViewer');
			data.abort = true;
			
			if(!thumbsAr.length){
				d.reject();
				return d.promise();
			}

			data.revSortOrder = revSort;
			if(revSort){
				thumbsAr.reverse();
			}

			//when prev job aborted, start new job
			var self = this;
			$.when( data.busy_dfrd ).done(function(){
				data.busy_dfrd = $.Deferred();
				data.abort = false;
				addThumb__(self, thumbsAr, 0);
			});
			return d.promise();
		},
		
		selectAll: function(){
			var $this  = $(this);
			var data   = $this.data('ThumbsViewer');
			
			if( data.disableSel ){
				return;
			}
			
			data.thumbsSelected = 0;
			
			$this.find(".ThumbsViewer-thumb_block").each(function (){
				$(this).addClass("selected");
				++data.thumbsSelected;
			});
		},
		
		selectNone: function(){
			var $this  = $(this);
			var data   = $this.data('ThumbsViewer');
			
			if( data.disableSel ){
				return;
			}
			
			data.thumbsSelected = 0;
			$this.find(".ThumbsViewer-thumb_block").removeClass("selected");
		},
		
		selectionDisable: function(disable){
			var $this = $(this);
			var data   = $this.data('ThumbsViewer');
			data.disableSel = disable;
		},
		
		selectToggleAll: function(){
			var $this  = $(this);
			var data   = $this.data('ThumbsViewer');
			
			if( data.disableSel ){
				return;
			}
			
			var thumbsSelected = 0;
			var thumbsTotal = 0;
			
			$this.find(".ThumbsViewer-thumb_block").each(function(){
				++thumbsTotal;
				if( $(this).hasClass("selected") ){
					++thumbsSelected;
				}
			});
			
			if(thumbsSelected == thumbsTotal){
				$this.find(".ThumbsViewer-thumb_block").removeClass("selected");
				data.thumbsSelected = 0;
			}else{
				$this.find(".ThumbsViewer-thumb_block").addClass("selected");
				data.thumbsSelected = thumbsTotal;
			}
		},
		
		selectToggleVisible: function(){
			var $this  = $(this);
			var data   = $this.data('ThumbsViewer');

			if( data.disableSel ){
				return;
			}

			var $thumbs = $this.find(".ThumbsViewer-thumb_block");
			if(!$thumbs.length){//no thumbs in container
				return;
			}

			var $parentDiv = $this.parent().first();
			var divHeight = $parentDiv.innerHeight();
			var liHeight = $thumbs.first().outerHeight();
			var rowsScrolled = Math.round($parentDiv.scrollTop()/liHeight);
			var rowsOnScreen = Math.ceil(divHeight/liHeight);

			var selFirstIndex = rowsScrolled*defaults.ThumbsInRow;
			var selLastIndex = Math.min(selFirstIndex + rowsOnScreen*defaults.ThumbsInRow, $thumbs.length);
			$thumbs = $thumbs.slice(selFirstIndex, selLastIndex);

			var thumbsSelected = 0;
			var thumbsTotal = 0;
			$thumbs.each(function(){
				++thumbsTotal;
				if( $(this).hasClass("selected") ){
					++thumbsSelected;
				}
			});

			if(thumbsSelected == thumbsTotal){
				$thumbs.removeClass("selected");
			}else{
				$thumbs.addClass("selected");
			}

			data.thumbsSelected = $this.find(".ThumbsViewer-thumb_block.selected").length;
		},

		empty: function() {
			var $this = $(this);
			var data   = $this.data('ThumbsViewer');
			data.abort = true;//abort job in progress(if any)
			
			//when job aborted, clean container
			$.when( data.busy_dfrd ).done(function(){
				$this.empty();
				data.thumbsSelected = 0;
			});
		},
		
		sort: function(revSort) {
			var $this = $(this);
			var data   = $this.data('ThumbsViewer');

			//if busy, abort sorting
			if( data.busy_dfrd.state() != "resolved" ){
				return;
			}

			//if sort order changed, resort thumbs
			if( data.revSortOrder != revSort ){
				data.revSortOrder = revSort;

				var $thumbs = $this.find(".ThumbsViewer-thumb_block");
				$thumbs.detach();
				var thumbsLi = $thumbs.toArray().reverse();
				for( var i = 0; i < thumbsLi.length; ++i){
					$this.append(thumbsLi[i]);
				}
			}
		},
		onSelClick__: function(event, parent){
			var $this = $(this);
			var data = $this.data('ThumbsViewer');
			var url = "//vk.com/photo" + data.img.owner_id + "_" + data.img.pid;
			var myWindow = window.open(url, 'vk_photo', defaults.vkPhotoPopupSettings, false);
			myWindow.focus();
		},
		
		onZoomClick__: function(event, parent){
			//do nothing here, using handler from <a onclick="...">
			event.stopPropagation();
			return false;
		}
	};
	
	function getSelThumbsData() {
		var thumbData = [];
		
		this.find(".ThumbsViewer-thumb_block.selected").each(function(){
			$this = $(this);
			var data = $this.data('ThumbsViewer');
			data.$thumb = $this;
			thumbData.push(data);
		});
		
		return thumbData;
	}
	
	function getSelThumbsNum() {
		var data = this.data('ThumbsViewer');
		
		return data.thumbsSelected;
	}

	$.fn.ThumbsViewer = function (method) {
		var args = arguments;
		
		if(method == "getSelThumbsData"){
			return getSelThumbsData.apply( this );
		}else if(method == "getSelThumbsNum"){
			return getSelThumbsNum.apply( this );
		}else if(method == "addThumbList"){
			return methods.addThumbList.apply( this, Array.prototype.slice.call(args, 1 ) );
		}
		
		return this.each(function() {
			if ( methods[method] ) {
				return methods[ method ].apply( this, Array.prototype.slice.call(args, 1 ));
			} else if ( typeof method === 'object' || !method ) {
				return methods.init.apply( this, args );
			} else {
				$.error( 'Method ' +  args + ' does not exist on jQuery.ThumbsViewer' );
			}
		});
	};
})( jQuery, hs );

$.fn.spin = function(opts) {
	this.each(function() {
		var $this = $(this),
			data = $this.data();

		if ( (opts === false) && (data.spinner) ) {
			data.spinner.stop();
			delete data.spinner;
		} else if ((!data.spinner) && (opts !== false)) {
			data.spinner = new Spinner($.extend({color: $this.css('color')}, opts)).spin(this);
		}
	});
	return this;
};

function getParameterByName(name){
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var regexS = "[\\?&]" + name + "=([^&#]*)";
	var regex = new RegExp(regexS);
	var results = regex.exec(window.location.search);
	if(results == null)
		return null;
	else
		return decodeURIComponent(results[1].replace(/\+/g, " "));
}

function displayError(eMsg, noteDivId, hideAfter){
	var errEntity = "<div class=\"ui-widget\"><div class=\"ui-state-error ui-corner-all\" style=\"padding: 0 .7em;\"><p><span class=\"ui-icon ui-icon-alert\" style=\"float: left; margin-right: .3em;\"></span><strong>ОШИБКА: </strong>" + eMsg + "</p></div></div>";
	$("#"+noteDivId).empty().html(errEntity);
	
	if(hideAfter){
		setTimeout(function(){
			$("#"+noteDivId).empty()
		}, hideAfter);
	}
}

function displayWarn(eMsg, noteDivId, hideAfter){
	var errEntity = "<div class=\"ui-widget\"><div class=\"ui-state-error ui-corner-all\">" + eMsg + "</div></div>";
	$("#"+noteDivId).empty().html(errEntity);
	
	if(hideAfter){
		setTimeout(function(){
			$("#"+noteDivId).empty()
		}, hideAfter);
	}
}

function showInviteBox(){
	VK.callMethod("showInviteBox");
}

function showSpinner(){
	var opts = {
		lines: 17,
		length: 26,
		width: 11,
		radius: 40,
		corners: 1,
		rotate: 0,
		color: '#000',
		speed: 0.9,
		trail: 64,
		shadow: false,
		hwaccel: false,
		className: 'spinner',
		zIndex: 2e9,
		top: 'auto',
		left: 'auto'
	};
	$("body").spin(opts);
}

function hideSpinner(){
	$("body").spin(false);
}

function blinkDiv(divId, blinks, delay){
	var bclass = "blink_1";
	
	function toggleBlink(el, blinks, delay){
		if( !blinks ){
			setTimeout(function(){el.removeClass(bclass);}, delay);
			return;
		}
		
		if( el.hasClass(bclass) ){
			el.removeClass(bclass);
		}else{
			el.addClass(bclass);
		}
		setTimeout(function(){toggleBlink(el, --blinks, delay);}, delay);
	}
	
	toggleBlink($("#"+divId), blinks, delay);
}

function getAllPhotosChunk(ownerID, offset, count){
	var d = $.Deferred();
	VK.api("photos.getAll", {owner_id: ownerID, offset: offset, count: count, extended: 1}, function(data) {
		if(data.response){
			d.resolve(data.response.slice(1));
		}else{
			displayError("Не удалось получить фотографии.", "globalErrorBox", Settings.errorHideAfter);
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
			displayError("Не удалось получить общее количество фотографий.", "globalErrorBox", Settings.errorHideAfter);
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
			displayError("Не удалось получить список друзей.", "globalErrorBox", Settings.errorHideAfter);
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
			displayError("Не удалось получить список групп.", "globalErrorBox", Settings.errorHideAfter);
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
				if( self.ratedPhotos.length > Settings.maxRatedPhotos ){
					self.ratedPhotos = self.ratedPhotos.slice(0, Settings.maxRatedPhotos);
				}
				self.$chosenPhotosSpan.text(self.ratedPhotos.length);
				
				$("#thumbs_container").ThumbsViewer("addThumbList", self.ratedPhotos);
				self.disableControls(0);
				
				if( self.ratedPhotos.length > 10 ){
					setTimeout(function(){
						self.rateRequest();
					}, Settings.rateRequestDelay);
				}else if ( !self.ratedPhotos.length ){ //no photos found
					displayError("Не удалось составить рейтинг! Не найдено фотографий, с рейтингом выше " + Settings.likedThresh, "globalErrorBox", Settings.errorHideAfter);
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
			
			getAllPhotosChunk(ownerId, offset, Settings.getPhotosCunksSz).done( function(photos) {
				var ratedPhotos = self.filterPhotos(photos, Settings.likedThresh);
				self.ratedPhotos = self.ratedPhotos.concat(ratedPhotos);
				
				self.updateProgress(offset + photos.length);

				setTimeout(function(){
					getNextChunk__(offset + Settings.getPhotosCunksSz, total);
				}, Settings.vkApiDelay);
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
				setTimeout(function(){blinkDiv("vk_like", Settings.blinkCount, Settings.blinkDelay);}, BlinkerDelay);
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

		validateApp(Settings.vkSid, Settings.vkAppLocation, Settings.redirectDelay);
		
		$("#thumbs_container").ThumbsViewer();
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