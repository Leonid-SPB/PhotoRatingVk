/**
*	Site-specific configuration settings for Highslide JS
*/
hs.graphicsDir = 'graphics/';
hs.showCredits = false;
hs.outlineType = 'rounded-white';
hs.dimmingOpacity = 0.80;
hs.fadeInOut = true;
hs.align = 'center';
hs.minWidth = 800;
hs.minHeight = 600;
hs.maxWidth = 800;
hs.maxHeight = 600;
hs.useBox = true;
hs.width = 800;
hs.height = 600;
hs.restoreCursor = null;
hs.allowMultipleInstances = false;
hs.closeButtonHtml = '<div class="close-simple-white" onclick="return hs.close(this)" title="Закрыть"></div>';
hs.captionEval = '$(this.a).data().caption';
hs.headingEval = '$(this.a).data().title + hs.closeButtonHtml';
hs.captionOverlay.position = 'below';
hs.headingOverlay.position = 'above';

// Add the slideshow controller
hs.addSlideshow({
	slideshowGroup: 'group1',
	interval: 5000,
	repeat: false,
	useControls: true,
	fixedControls: 'fit',
	overlayOptions: {
		opacity: 0.75,
		position: 'bottom center',
		offsetX: 0,
		offsetY: -15,
		hideOnMouseOut: false
	}
});

// Russian language strings
hs.lang = {
	cssDirection: 'ltr',
	loadingText: 'Загружается...',
	loadingTitle: 'Нажмите для отмены',
	focusTitle: 'Нажмите чтобы поместить на передний план',
	fullExpandTitle: 'Развернуть до оригинального размера',
	creditsText: 'Использует <i>Highslide JS</i>',
	creditsTitle: 'Перейти на домашнюю страницу Highslide JS',
	previousText: 'Предыдущее',
	nextText: 'Следующее',
	moveText: 'Переместить',
	closeText: 'Закрыть',
	closeTitle: 'Закрыть (esc)',
	resizeTitle: 'Изменить размер',
	playText: 'Слайдшоу',
	playTitle: 'Начать слайдшоу (пробел)',
	pauseText: 'Пауза',
	pauseTitle: 'Приостановить слайдшоу (пробел)',
	previousTitle: 'Предыдущее (стрелка влево)',
	nextTitle: 'Следующее (стрелка вправо)',
	moveTitle: 'Переместить',
	fullExpandText: 'Оригинальный размер',
	number: 'Изображение %1 из %2',
	restoreTitle: 'Нажмите чтобы закрыть изображение. Для просмотра изображений используйте стрелки.'
};

// gallery config object
hs.config1 = {
	slideshowGroup: 'group1',
	transitions: ['expand', 'crossfade']
};
