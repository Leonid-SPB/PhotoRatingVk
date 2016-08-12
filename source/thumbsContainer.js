/** Copyright (c) 2013-2016 Leonid Azarenkov
    Licensed under the MIT license
*/

/* Thumbs Container
requires: jQuery, highslide
 */
(function( $, hs ) {
	var defaults = {
		AddThumbDelay       : 250,
		VkPhotoPopupSettings: 'toolbar=yes,scrollbars=yes,resizable=yes,width=1024,height=600'
	};
	
	var thC = {
		///initialize Thumbs Container
		init: function(opts) {
			var $this = $(this);

			var data = {
				disableSel    : false,
				revSortOrder  : false,

				//private
				busy_dfrd__   : $.Deferred(),
				abortTask__   : false,
				thumbsSelCnt__: 0
			};
			data.busy_dfrd__.resolve();
			$.extend(data, defaults, opts);
			
			$this.data('ThumbsViewer', data);
			$this.addClass("ThumbsViewer-thumbs_container");
			$this.on("click.ThumbsViewer", ".ThumbsViewer-thumb_block", function(event){thC.onThumbClick.call(this, event, $this)});
			$this.on("click.ThumbsViewer", ".ThumbsViewer_zoom-ico", function(event){thC.onZoomClick.call(this, event, $this)});
		},
		
		///expects object VK API image object
		addThumb: function(vk_img) {
			var $this = $(this);
			var $data = $(this).data('ThumbsViewer');
			var thumb_parent = $("<div class='ThumbsViewer-thumb_block loading' />");

			function getSelSizeUrl(vk_img, szLiterPref, szLiterAlt) {
				var src_alt = vk_img.sizes[0].src;
				for (var i = 0; i < vk_img.sizes.length; ++i) {
					if (vk_img.sizes[i].type == szLiterPref) {
						return vk_img.sizes[i].src;
					} else if (vk_img.sizes[i].type == szLiterAlt) {
						src_alt = vk_img.sizes[i].src;
					}
				}
				return src_alt;
			}

			var titleStr = thC.makeTitle.call(this, vk_img);
			var captionStr = thC.makeCaption.call(this, vk_img);
			var zoomImgSrc = getSelSizeUrl(vk_img, 'y', 'x');
			var aa = $("<a />", {
				class: 'ThumbsViewer-hslink',
				href: zoomImgSrc, title: 'Увеличить', 
				onclick: 'return hs.expand(this, hs.config1)'
			}).data({title: titleStr, caption: captionStr});
			var zoomIcon = $('<div class="ThumbsViewer_zoom-ico" />').append(aa);

			var imgSrc = getSelSizeUrl(vk_img, 'p', 'm');
			var thumb_img = $("<img />");
			thumb_img.on('load', function(){
				thumb_parent.removeClass('loading');
				thumb_parent.addClass('showphoto');
				thumb_parent.css('background-image', 'url(' + imgSrc + ')');
				thumb_img.on('load', null);
			});
			thumb_img.attr({src: imgSrc, title: "Открыть фото"});

			thumb_parent.append(zoomIcon);
			thumb_parent.data('ThumbsViewer', {vk_img: vk_img});
			thC.onAddThumb.call(this, thumb_parent);
			thumb_parent.appendTo($this);
		},
		
		///removes $thumb div from container
		removeThumb: function($thumb){
			if($thumb.hasClass("selected")){
				var $data   = $(this).data('ThumbsViewer');
				--$data.thumbsSelCnt__;
			}
			$thumb.remove();
		},
		
		///thumbsAr is expected to be non empty array with elements containing .src property
		///returns Deferred which will be resolved when all thumbs are added to container or job is aborted
		addThumbList: function(thumbsAr, revSort){
			var $this = $(this);
			var $data  = $this.data('ThumbsViewer');
			var d = $.Deferred();

			function addThumb__(self, thumbsAr, idx){
				var $data   = $(self).data('ThumbsViewer');
				if(idx >= thumbsAr.length || $data.abortTask__){
					$data.busy_dfrd__.resolve();
					d.resolve();
					return;
				}
				
				thC.addThumb.call(self, thumbsAr[idx++]);
				setTimeout(function(){addThumb__(self, thumbsAr, idx);}, $data.AddThumbDelay);
			}
			
			//abort prev job in progress
			$data.abortTask__ = true;
			
			if(!thumbsAr.length){
				d.reject();
				return d.promise();
			}

			$data.revSortOrder = revSort;
			if(revSort){
				thumbsAr.reverse();
			}

			//when prev job aborted, start new job
			var self = this;
			$.when( $data.busy_dfrd__ ).done(function(){
				$data.busy_dfrd__ = $.Deferred();
				$data.abortTask__ = false;
				addThumb__(self, thumbsAr, 0);
			});
			return d.promise();
		},
		
		///select all thumbnails in container
		selectAll: function(){
			var $this  = $(this);
			var $data   = $this.data('ThumbsViewer');
			
			if( $data.disableSel ){
				return;
			}
			
			$data.thumbsSelCnt__ = 0;
			
			$this.find(".ThumbsViewer-thumb_block").each(function (){
				$(this).addClass("selected");
				++$data.thumbsSelCnt__;
			});
		},
		
		///deselect all thumbnails in container
		selectNone: function(){
			var $this  = $(this);
			var $data   = $this.data('ThumbsViewer');
			
			if( $data.disableSel ){
				return;
			}
			
			$data.thumbsSelCnt__ = 0;
			$this.find(".ThumbsViewer-thumb_block").removeClass("selected");
		},
		
		///disable/enable selection
		selectionDisable: function(disable){
			var $this = $(this);
			var $data   = $this.data('ThumbsViewer');
			$data.disableSel = disable;
		},
		
		///select all if any one is selected, deselect all if all are selected
		selectToggleAll: function(){
			var $this  = $(this);
			var $data   = $this.data('ThumbsViewer');
			
			if( $data.disableSel ){
				return;
			}
			
			var thumbsSelCnt__ = 0;
			var thumbsTotal = 0;
			
			$this.find(".ThumbsViewer-thumb_block").each(function(){
				++thumbsTotal;
				if( $(this).hasClass("selected") ){
					++thumbsSelCnt__;
				}
			});
			
			if(thumbsSelCnt__ == thumbsTotal){
				$this.find(".ThumbsViewer-thumb_block").removeClass("selected");
				$data.thumbsSelCnt__ = 0;
			}else{
				$this.find(".ThumbsViewer-thumb_block").addClass("selected");
				$data.thumbsSelCnt__ = thumbsTotal;
			}
		},
		
		///for currently visible on screen: select all if any one is selected, deselect all if all are selected
		selectToggleVisible: function(){
			var $this  = $(this);
			var $data   = $this.data('ThumbsViewer');

			if( $data.disableSel ){
				return;
			}

			var $thumbs = $this.find(".ThumbsViewer-thumb_block");
			if(!$thumbs.length){//no thumbs in container
				return;
			}

			var $parentDiv = $this.parent().first();
			var divHeight = $parentDiv.innerHeight();
			var divWidth  = $parentDiv.innerWidth();
			var liHeight = $thumbs.first().outerHeight();
			var liWidth = $thumbs.first().outerWidth();
			var rowsScrolled = Math.round($parentDiv.scrollTop()/liHeight);
			var rowsOnScreen = Math.ceil(divHeight/liHeight);
			var thumbsInRow = Math.floor(divWidth/liWidth);

			var selFirstIndex = rowsScrolled * thumbsInRow;
			var selLastIndex = Math.min(selFirstIndex + rowsOnScreen * thumbsInRow, $thumbs.length);
			$thumbs = $thumbs.slice(selFirstIndex, selLastIndex);

			var thumbsSelCnt__ = 0;
			var thumbsTotal = 0;
			$thumbs.each(function(){
				++thumbsTotal;
				if( $(this).hasClass("selected") ){
					++thumbsSelCnt__;
				}
			});

			if(thumbsSelCnt__ == thumbsTotal){
				$thumbs.removeClass("selected");
			}else{
				$thumbs.addClass("selected");
			}

			$data.thumbsSelCnt__ = $this.find(".ThumbsViewer-thumb_block.selected").length;
		},
		
		///returns array of 'data' associated with thumbnails in container
		getSelThumbsData: function() {
			var thumbData = [];
		
			this.find(".ThumbsViewer-thumb_block.selected").each(function(){
				$this = $(this);
				var $data = $this.data('ThumbsViewer');
				$data.$thumb = $this;
				thumbData.push($data);
			});
			
			return thumbData;
		},
	
		///returns number of thumbnails selected
		getSelThumbsCount: function () {
			var $data = $(this).data('ThumbsViewer');
			
			return $data.thumbsSelCnt__;
		},

		///remove all thumbnails from container
		empty: function() {
			var $this = $(this);
			var $data   = $this.data('ThumbsViewer');
			$data.abortTask__ = true;//abort job in progress(if any)
			
			hs.close();
			
			//when job aborted, clean container
			$.when( $data.busy_dfrd__ ).done(function(){
				$this.empty();
				$data.thumbsSelCnt__ = 0;
			});
		},
		
		///reorder thumbnails in container (straight/reverse)
		reorder: function(revSort) {
			var $this = $(this);
			var $data   = $this.data('ThumbsViewer');

			//if busy, abort sorting
			if( $data.busy_dfrd__.state() != "resolved" ){
				return;
			}

			//if sort order changed, resort thumbs
			if( $data.revSortOrder != revSort ){
				$data.revSortOrder = revSort;

				var $thumbs = $this.find(".ThumbsViewer-thumb_block");
				$thumbs.detach();
				var thumbsLi = $thumbs.toArray().reverse();
				for( var i = 0; i < thumbsLi.length; ++i){
					$this.append(thumbsLi[i]);
				}
			}
		},
		
		makeTitle: function(vk_img) {
			return 'Фото %1/%2:&nbsp; &#10084; ' + vk_img.likes.count;
		},
		
		makeCaption: function(vk_img) {
			var $this = $(this);
			var $data   = $this.data('ThumbsViewer');
			
			var album = "Undefined";
			var origUrl = "//vk.com/photo" + vk_img.owner_id + "_" + vk_img.id;
			var onClickOrigUrl = "var myWindow = window.open('" + origUrl + "', 'vk_photo', '" + $data.VkPhotoPopupSettings + "', false); myWindow.focus();";
			var caption = '\
				<div>\
					<div class="highslide-caption-divinfo" style="text-align: left"><b>Альбом</b>:<i> %1</i></div><div class="highslide-caption-divinfo" style="text-align: right"><a onclick="%2">Оригинал фото</a></div>\
				</div>\
				<div class="highslide-caption-descr">%3</div>';
			
			caption = caption.replace("%1", album);
			caption = caption.replace("%2", onClickOrigUrl);
			caption = caption.replace("%3", vk_img.text);
			
			return caption;
		},
		
		///addThumb() calls this function modify $thumb object before insertion to the container
		onAddThumb: function($thumb){
			//!!!
			var vk_img = $thumb.data('ThumbsViewer').vk_img;
			var likesbox = '<div class="ui-state-default ThumbsViewer_likesBox ui-corner-br">&#10084; ' + vk_img.likes.count + '</div>';
			$thumb.append($(likesbox));
		},
		
		///click on thumbnail area
		onThumbClick: function(event, parent){
			//!!!
			var $this = $(this);
			var $data = $this.data('ThumbsViewer');
			var url = "//vk.com/photo" + $data.vk_img.owner_id + "_" + $data.vk_img.id;
			var myWindow = window.open(url, 'vk_photo', parent.data('ThumbsViewer').VkPhotoPopupSettings, false);
			myWindow.focus();
		},
		
		///click on zoom icon
		onZoomClick: function(event, parent){
			//!!!
			//do nothing here, using handler from <a onclick="...">
			event.stopPropagation();
			return false;
		}
	};


	$.fn.ThumbsViewer = function (method) {
		var args = arguments;
		
		if(method == "getSelThumbsData"){
			return thC.getSelThumbsData.apply( this );
		}else if(method == "getSelThumbsNum"){
			return thC.getSelThumbsCount.apply( this );
		}else if(method == "addThumbList"){
			return thC.addThumbList.apply( this, Array.prototype.slice.call(args, 1 ) );
		}
		
		return this.each(function() {
			if ( thC[method] ) {
				return thC[ method ].apply( this, Array.prototype.slice.call(args, 1 ));
			} else if ( typeof method === 'object' || !method ) {
				return thC.init.apply( this, args );
			} else {
				$.error( 'Method ' +  args + ' does not exist on jQuery.ThumbsViewer' );
			}
		});
	};
})( jQuery, hs );
