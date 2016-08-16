/** Copyright (c) 2013-2016 Leonid Azarenkov
	Licensed under the MIT license
*/

//requires jQuery, spin.js

function getParameterByName(name, rfr){
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var regexS = "[\\?&]" + name + "=([^&#]*)";
	var regex = new RegExp(regexS);
	var results;
	if (rfr) {
		results = regex.exec(document.referrer);
	} else {
		results = regex.exec(window.location.search);
	}
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


var RateLimit = (function() {
	//by Matteo Agosti
	var RateLimit = function(maxOps, interval, allowBursts) {
		this._maxRate = allowBursts ? maxOps : maxOps / interval;
		this._interval = interval;
		this._allowBursts = allowBursts;

		this._numOps = 0;
		this._start = new Date().getTime();
		this._queue = [];
	};

	RateLimit.prototype.schedule = function(fn) {
		var that = this,
			rate = 0,
			now = new Date().getTime(),
			elapsed = now - this._start;

		if (elapsed > this._interval) {
			this._numOps = 0;
			this._start = now;
		}

		rate = this._numOps / (this._allowBursts ? 1 : elapsed);

		if (rate < this._maxRate) {
			if (this._queue.length === 0) {
				this._numOps++;
				fn();
			}
			else {
				if (fn) this._queue.push(fn);

				this._numOps++;
				this._queue.shift()();
			}
		}
		else {
			if (fn) this._queue.push(fn);

			setTimeout(function() {
				that.schedule();
			}, 1 / this._maxRate);
		}
	};

	return RateLimit;
})();
