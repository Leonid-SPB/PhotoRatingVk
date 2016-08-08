/** Copyright (c) 2013-2016 Leonid Azarenkov
    Licensed under the MIT license
*/

//requires jQuery, spin.js

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
