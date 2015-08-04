/*
  How to write a Template JS function. Conventions and etc.

  1) $template is a jQuery object to the SECTION container around the template.
  2) All references within should use "$template.find()". NOT $('#someid')!!
  3) Templates should exist in alphabetical order
  4) References to jQuery DOM objects start with "$". (example: $ul or $lis)
  5) Eval templates MUST expose a "getIsCorrect" property, which returns a boolean
  6) init function should always return "this" (reference to template object)
  7) All templates must include the '_common' mixin, like so:
    $.extend(this, xp.templates._common($template, config));
 */

xp.templates._common = function($template, config){
  var mediaElementPlayers = [], audioElementPlayer, playAudioFailCount = 0, interval,
    audioFiles = {}, $flashPlayers= $template.find('.media-container object'),
    api = {
      playAudio: function(trigger){
        if (!audioElementPlayer) return;

        // If 'audioElementPlayer' is not yet ready, wait a moment, then try again.
        // 'isReady' is set within 'audioElementPlayer.success'.
        // This allows us to call 'playAudio' outside of 'audioElementPlayer.success'.
        // 'clearInterval' and 'setInterval' ensure that only the most recent
        // 'playAudio' call is is honored. Calls are not queued/stacked!
        clearInterval(interval);
        if (!audioElementPlayer.isReady){
          interval = setInterval(function(){
            if (audioElementPlayer.isReady){
              api.playAudio(trigger);
            }
            else{
              if (++playAudioFailCount>99){
                clearInterval(interval);
              }
            }
          }, 250);

          return;
        }

        trigger = trigger.toLowerCase();

        this.stopMediaElementPlayers();

        if (audioFiles.hasOwnProperty(trigger)){
          audioElementPlayer.setSrc(audioFiles[trigger]);
          audioElementPlayer.load();
          audioElementPlayer.play();
        }
        else{
          audioElementPlayer.setSrc(' '); // @todo What to do here when there is no audio file?
        }
      },

      // Stops all Flash, MediaElement video, and MediaElement audio
      stopAllMedia: function(){
        this.stopMediaElementPlayers();
        this.stopFlash();
      },

      // Stop all MediaElement.js objects
      stopMediaElementPlayers: function(){
        var i, count = mediaElementPlayers.length;

        for (i=0; i<count; i++){
          try{ // Try/catch needed for IE. Not sure why.
            mediaElementPlayers[i].pause();
            if (mediaElementPlayers[i].isVideo && mediaElementPlayers[i].getCurrentTime()){
              mediaElementPlayers[i].setCurrentTime(0);
            }
          }
          catch(er){}
        }
      },

      // Stop all Flash (Chrome does this automatically, but others needs this help)
      stopFlash: function(){
        var i, count = $flashPlayers.length;

        for (i=0; i<count; i++){
          try{
            $flashPlayers[i].StopPlay();
            $flashPlayers[i].Rewind();
          }
          catch(er){}
        }
      },

      // Play the visible Flash (Chrome does this automatically, but others needs this help)
      playFlash: function(){
        $flashPlayers.each(function(index){
          if($(this).is(':visible')){
            try{
              $flashPlayers[index].Play();
            }
            catch(er){}
          }
        });
      }
    };

  // Initialize MediaElement.js video objects, and hold ref to each
  $template.find('video').each(function(){
    mediaElementPlayers.push(new MediaElementPlayer(this));
  });

  // Remove all audio tags from source, and hold onto src of each
  $template.find('audio').each(function(){
    var $audio = $(this);
    audioFiles[$audio.data('trigger').toLowerCase()] = $audio.remove().attr('src');
  });

  // Any audio referenced in config?
  if (config && config.hasOwnProperty('audio')){
    $.each(config.audio, function(key, val){
      audioFiles[key.toLowerCase()] = val;
    });
  }

  // Create a single audio element (if this page has any audio)
  if (!$.isEmptyObject(audioFiles)){
    $template.before(
      $('<div></div>', {id:'narration'}).append(
        $('<audio></audio>', {src:' ', type:'audio/mp3'})
      )
    );

    // Initialize MediaElement.js audio object, and play initial audio
    audioElementPlayer = new MediaElementPlayer('#narration audio', {
      audioWidth: 245, // same width as main navigation buttons
      success: function(){
        setTimeout(function(){
          audioElementPlayer.isReady = true;
        }, 10);
      }
    });
    audioElementPlayer.isReady = false;

    mediaElementPlayers.push(audioElementPlayer);

    // Play initial audio
    api.playAudio('load');
  }

  return api;
};

xp.templates.evalmatch = {
  // Shared props
  autofill: false,
  isShowFeedback: true,
  isShowCorrectOptions: true,
  submitEvent: function(){
    this.onSubmit_$form();
  },
  tryCount: 0,
  userAnswer: [],
  feedback: {
    correct: 'Correct.',
    incorrect: 'Incorrect.',
    tryAgain: 'Incorrect, try again.'
  },
  $fieldset: null,
  $selects: null,
  $form: null,
  $submit: null,
  $reset: null,
  $feedback: null,

  init: function($template, config){
    $.extend(this, xp.templates._common($template, config));

    // Set vars and get references
    var self = this;
    this.$fieldset = $template.find('fieldset');
    this.$form = $template.find('form');
    this.$submit = $template.find('#submit');
    this.$reset = $template.find('#reset')
    this.$feedback = $template.find('#feedback');
    this.parseConfig(config);

    // Shuffle pairs
    this.$fieldset.shuffle().css('visibility', 'visible');

    // Get reference for $selects, AFTER shuffle.
    this.$selects = this.$fieldset.find('select');

    // Add ARIA properties
    this.$submit.attr({'aria-controls':'feedback'});
    this.$fieldset.attr({'aria-live':'polite'});

    // Hook up selects
    this.$fieldset.on('change', 'select', function(){
      self.onChange_$selects($(this));
    });

    // Hook up submit
    this.$form.submit(function(event){
      self.submitEvent();

      event.preventDefault();
    });

    //Hook up reset button
    this.$reset.click(function(){
      self.onClick_$reset();
    });

    // Autofill question?
    if (this.autofill){
      $.each(this.userAnswer, function(index, value){
        $template.find('select[name='+value.name+']').val(value.value);
      });

      this.tryCount = 1;
      this.$form.submit();
      $template.find('footer').empty();
    }

    return this;
  },
  parseConfig: function(config){
    if (config.hasOwnProperty('isShowFeedback')){
      this.isShowFeedback = config.isShowFeedback;
    }
    if (config.hasOwnProperty('isShowCorrectOptions')){
      this.isShowCorrectOptions = config.isShowCorrectOptions;
    }
    if (config.hasOwnProperty('userAnswer')){
      this.userAnswer = config.userAnswer;
      this.autofill = true;
    }
    if (config.hasOwnProperty('submitEvent')){
      this.submitEvent = config.submitEvent;
    }
    if (config.hasOwnProperty('tryCount')){
      this.tryCount = config.tryCount;
    }
    if (config.hasOwnProperty('feedback')){
      if (config.feedback.hasOwnProperty('correct')){
        this.feedback.correct = config.feedback.correct;
      }
      if (config.feedback.hasOwnProperty('tryAgain')){
        this.feedback.tryAgain = config.feedback.tryAgain;
      }
      if (config.feedback.hasOwnProperty('incorrect')){
        this.feedback.incorrect = config.feedback.incorrect;
      }
    }
  },
  showFeedback: function(type){
    if (this.isShowFeedback){
      $.scrollTo(
        this.$feedback.removeClass(
          'feedback-correct feedback-try-again feedback-incorrect'
        ).addClass(
          'feedback-'+type.replace('A', '-a') // tryAgain vs try-again
        ).html(this.feedback[type])
      );

      this.playAudio(type);
    }
  },
  showCorrectOptions: function(){
    if (this.isShowCorrectOptions){
      this.$selects.each(function(){
        var $select = $(this),
          correctText = $select.find(
            '[value='+$select.attr('name').replace('pair', '')+']'
          ).text();

        $select.after(
          $('<span></span>', {'class':'correct-match', text:correctText})
        );
      });
    }
  },
  getIsCorrect: function(){
    var i, len = this.$selects.length, $select;

    for (i=0; i<len; i++){
      $select = $(this.$selects[i]);
      if ($select.val()!=$select.attr('name').replace('pair', '')){
        return false;
      }
    }

    return true;
  },
  disableQuestion: function(){
    this.$selects.prop('disabled', true);
    this.$submit.prop('disabled', true);
    this.$reset.prop('disabled', true);
  },
  enableQuestion: function(){
    this.$selects.prop('disabled', false);
    this.$submit.prop('disabled', false);
    this.$reset.prop('disabled', false);
  },
  onChange_$selects: function($select){
    var i, userAnswerCount = this.userAnswer.length,
      name = $select.attr('name'), value = $select.val();

    for (i=0; i<userAnswerCount; i++){
      if (this.userAnswer[i].name==name){
        this.userAnswer[i].value = value;
        return;
      }
    }

    // Not found, add into array
    this.userAnswer.push({name:name, value:value});
  },
  onSubmit_$form: function(){
    this.tryCount++;

    this.disableQuestion();

    if (this.getIsCorrect()){
      this.showFeedback('correct');
      this.showCorrectOptions();
    }
    else{
      if (this.tryCount==1){
        this.showFeedback('tryAgain');

        this.enableQuestion();
      }
      else{
        this.showFeedback('incorrect');
        this.showCorrectOptions();
      }
    }
  },
  onClick_$reset: function(){
    this.userAnswer = [];
  }
};

xp.templates.evalmc = {
  // Shared props
  autofill: false,
  isShowFeedback: true,
  isShowCorrectOptions: true,
  submitEvent: function(){
    this.onSubmit_$form();
  },
  tryCount: 0,
  correctAnswer: [],
  userAnswer: [],
  feedback: {
    correct: 'Correct.',
    incorrect: 'Incorrect.',
    tryAgain: 'Incorrect, try again.'
  },
  isShuffleOptions: true,
  $fieldset: null,
  $options: null,
  $form: null,
  $submit: null,
  $reset: null,
  $feedback: null,

  init: function($template, config){
    $.extend(this, xp.templates._common($template, config));

    // Set vars and get references
    var self = this;
    this.$fieldset = $template.find('fieldset');
    this.$form = $template.find('form');
    this.$submit = $template.find('#submit');
    this.$reset = $template.find('#reset');
    this.$feedback = $template.find('#feedback');
    this.parseConfig(config);

    // Shuffle option elements?
    if (this.isShuffleOptions){this.$fieldset.shuffle();}
    this.$fieldset.css('visibility', 'visible');

    // Get references for checkboxes/radios, AFTER shuffle.
    this.$options = this.$fieldset.find('input');

    // Add ARIA properties
    this.$submit.attr({'aria-controls':'feedback'});

    // Hook up options
    this.$fieldset.on('change', 'input', function(){
      self.onChange_$options();
    });

    // Hook up submit
    this.$form.submit(function(event){
      self.submitEvent();

      event.preventDefault();
    });

    // Hook up reset
    this.$reset.click(function(event){
      self.onClick_$reset();
    });

    // Autofill question?
    if (this.autofill){
      $.each(this.userAnswer, function(index, value){
        self.$options.filter('[value='+value+']').prop('checked', true);
      });

      this.tryCount = 1;
      this.$form.submit();
      $template.find('footer').empty();
    }

    return this;
  },
  parseConfig: function(config){
    if (config.hasOwnProperty('isShowFeedback')){
      this.isShowFeedback = config.isShowFeedback;
    }
    if (config.hasOwnProperty('isShowCorrectOptions')){
      this.isShowCorrectOptions = config.isShowCorrectOptions;
    }
    if (config.hasOwnProperty('userAnswer')){
      this.userAnswer = config.userAnswer;
      this.autofill = true;
    }
    if (config.hasOwnProperty('submitEvent')){
      this.submitEvent = config.submitEvent;
    }
    if (config.hasOwnProperty('tryCount')){
      this.tryCount = config.tryCount;
    }
    if (config.hasOwnProperty('correctAnswer')){
      this.correctAnswer = config.correctAnswer;
    }
    if (config.hasOwnProperty('isShuffleOptions')){
      this.isShuffleOptions = config.isShuffleOptions;
    }
    if (config.hasOwnProperty('feedback')){
      if (config.feedback.hasOwnProperty('correct')){
        this.feedback.correct = config.feedback.correct;
      }
      if (config.feedback.hasOwnProperty('tryAgain')){
        this.feedback.tryAgain = config.feedback.tryAgain;
      }
      if (config.feedback.hasOwnProperty('incorrect')){
        this.feedback.incorrect = config.feedback.incorrect;
      }
    }
  },
  showFeedback: function(type){
    if (this.isShowFeedback){
      $.scrollTo(
        this.$feedback.removeClass(
          'feedback-correct feedback-try-again feedback-incorrect'
        ).addClass(
          'feedback-'+type.replace('A', '-a') // tryAgain vs try-again
        ).html(this.feedback[type])
      );

      this.playAudio(type);
    }
  },
  showCorrectOptions: function(){
    if (this.isShowCorrectOptions){
      var i, len = this.correctAnswer.length;

      for (i=0; i<len; i++){
        this.$options.filter(
          '[value="'+this.correctAnswer[i]+'"]'
        ).closest('p').addClass('correct-option');
      }
    }
  },
  getIsCorrect: function(){
    var stringify = function(ar){
      return ar.sort().join(',');
    };

    return (stringify(this.userAnswer)==stringify(this.correctAnswer));
  },
  disableQuestion: function(){
    this.$options.prop('disabled', true);
    this.$submit.prop('disabled', true);
    this.$reset.prop('disabled', true);
  },
  enableQuestion: function(){
    this.$options.prop('disabled', false);
    this.$submit.prop('disabled', false);
    this.$reset.prop('disabled', false);
  },
  onChange_$options: function(){
    this.userAnswer = $.map(this.$options.filter(':checked'), function(option){
      return $(option).val();
    });
  },
  onSubmit_$form: function(){
    this.tryCount++;

    this.disableQuestion();

    if (this.getIsCorrect()){
      this.showFeedback('correct');
      this.showCorrectOptions();
    }
    else{
      if (this.tryCount==1 && this.$options.length>2){
        this.showFeedback('tryAgain');
        this.enableQuestion();
      }
      else{
        this.showFeedback('incorrect');
        this.showCorrectOptions();
      }
    }
  },
  onClick_$reset: function(){
    this.userAnswer = [];
  }
};

xp.templates.evalmcg = {
  init: function($template, config){
    return xp.templates.evalmc.init($template, config);
  }
};

xp.templates.evalmcg2 = {
  init: function($template, config){
    return xp.templates.evalmc.init($template, config);
  }
};

xp.templates.evalscenario = {
  init: function($template, config){
    var templateOb = xp.templates.evalmc.init($template, config);

    // // Set vars and get references (adds shared props to evalmc object)
    templateOb.$helpMeDiv = $template.find('#help-me');
    templateOb.$helpMeLink = $('<a></a>', {
      id:'help-me-link', role:'button', 'aria-controls':'help-me',
      href:'#help-me', text:templateOb.$helpMeDiv.find('h4').text()
    }).insertAfter($template.find('div.media-container'));

    // Add ARIA properties
    templateOb.$helpMeDiv.attr({'aria-hidden':true, 'aria-labelledby':'help-me-link'});

    // Show/Hide Help Me text
    templateOb.$helpMeLink.click(function(event){
      if (templateOb.$helpMeDiv.is(':visible')){
        templateOb.$helpMeDiv.hide().attr('aria-hidden', true);

        templateOb.stopMediaElementPlayers();
      }
      else{
        templateOb.$helpMeDiv.show().attr('aria-hidden', false);

        templateOb.playAudio('help');
      }

      event.preventDefault();
    });

    return templateOb;
  }
};

xp.templates.evaltf = {
  init: function($template, config){
    // By default, do not shuffle options in a TF
    if (!config.hasOwnProperty('isShuffleOptions')){
      config.isShuffleOptions = false;
    }

    return xp.templates.evalmc.init($template, config);
  }
};

xp.templates.ibullet = {
  // Shared props
  bHtml: {},
  $bulletsUl: null,
  $bulletLinks: null,
  $bulletReveals: null,

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    var self = this;
    this.$bulletsUl = $template.find('#bullets');
    this.$bulletLinks = this.$bulletsUl.find('a');
    this.$bulletReveals = $template.find('#bullet-reveals');

    // Extract each bullet revealed text instance, then empty out div
    this.$bulletReveals.children().each(function(){
      var $div = $(this);
      self.bHtml[$div.find('a[tabindex="-1"]').attr('id')] = jQuery.trim(
        $div.find('a[tabindex="-1"], a[href="#bullets"]').remove().end().html()
      );
    }).end().html('');

    // Add ARIA properties
    this.$bulletReveals.attr({'role':'alert', 'aria-live':'assertive'});
    this.$bulletLinks.attr({'role':'button', 'aria-controls':'bullet-reveals'});

    // Hook up bullet clicks
    this.$bulletsUl.on('click', 'a', function(event){
      self.onClick_$bulletLinks($(this));

      event.preventDefault();
    });

    return this;
  },
  onClick_$bulletLinks: function($bulletLink){
    var id = $bulletLink.attr('href').replace('#', '');

    this.stopAllMedia();

    // Unset active state on all bullets, then set active on this one.
    this.$bulletLinks.parent().removeClass('active');
    $bulletLink.parent().addClass('active');

    $.scrollTo(this.$bulletReveals.html(this.bHtml[id]));

    this.playAudio(id.replace('-reveal', ''));
    this.playFlash();
  }
};

xp.templates.ibulletgraphic = {
  init: function($template){
    // Default ibullet behavior
    var templateOb = xp.templates.ibullet.init($template);

    // Add ARIA properties
    templateOb.$bulletReveals.attr('aria-hidden', true);

    // Hide initial image when any bullet clicked
    templateOb.swapOutInitialMedia = function(){
      $template.find('div.media-container[aria-hidden]').hide().attr('aria-hidden', true);
      templateOb.$bulletReveals.show().attr('aria-hidden', false);

      templateOb.$bulletLinks.unbind('click', templateOb.swapOutInitialMedia);
    }
    templateOb.$bulletLinks.click(templateOb.swapOutInitialMedia);

    return templateOb;
  }
},

xp.templates.ibulletreveal = {
  // Shared props
  bulletNum: 0,
  $bulletsUl: null,
  $bulletsLis: null,
  $bulletsMedia: null,
  $moreLink: null,
  $mainMedia: null,

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    var self = this;
    this.bulletNum = 0;
    this.$bulletsUl = $template.find('#bullets');
    this.$bulletsLis = this.$bulletsUl.children().remove();
    this.$bulletsMedia = this.$bulletsLis.find('div.media-container');
    this.$moreLink = $template.find('#more');
    this.$mainMedia = $template.find('#main-media');

    this.$bulletsUl.show();

    if (this.getIsBulletMedia()){
      // Strip images out of bulletsLi
      this.$bulletsLis.find('div.media-container').remove();
    }

    // Add ARIA properties
    this.$bulletsUl.attr({
      'aria-live':'assertive',
      'aria-relevant':'additions',
      'aria-atomic':false
    });
    this.$moreLink.attr({
      'role':'button',
      'aria-controls':'bullets',
      'aria-disabled':false
    });
    if (this.getIsBulletMedia()){
      this.$moreLink.attr('aria-controls', 'bullets main-media');
      this.$mainMedia.attr('aria-live', 'assertive');
    }

    // Hook up more button
    this.$moreLink.click(function(event){
      self.onClick_$moreLink();

      event.preventDefault();
    });

    return this;
  },
  getIsBulletMedia: function(){
    return (this.$bulletsMedia.length>0);
  },
  onClick_$moreLink: function(){
    if (this.getIsBulletMedia()){
      this.stopAllMedia();
    }

    if (this.$moreLink.hasClass('disabled')) return; // disabled, bail

    this.$bulletsUl.append(this.$bulletsLis[this.bulletNum]);
    if (this.getIsBulletMedia()){
      this.$mainMedia.html(this.$bulletsMedia[this.bulletNum]);
    }
    this.bulletNum++;

    this.playAudio('bullet'+this.bulletNum);
    if (this.getIsBulletMedia()){
      this.playFlash();
    }

    // Disable button?
    if (this.bulletNum==this.$bulletsLis.length){
      this.$moreLink.addClass('disabled').attr('aria-disabled', true);
    }
  }
};

xp.templates.ifullhs = {
  init: function($template, config){
    return xp.templates.ihs.init($template, config);
  }
};

xp.templates.ihs = {
  // Shared props
  hsHtml: {},
  $ul: null,
  $revealedText: null,
  $areas: null,

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    var self = this, $mediaContainer = $template.find('div.media-container');
    this.$revealedText = $template.find('#revealed-text');
    this.$areas = $template.find('area');

    // Extract each hot spot html instance
    $template.find('#hotspots').remove().children().each(function(){
      var $li = $(this);
      self.hsHtml[$li.find('a[tabindex="-1"]').attr('id')] = $.trim(
        $li.find('a[tabindex="-1"], a[href="#imagemap"]').remove().end().html()
      );
    });

    // Only used doing content development (graphic description in place of image)
    $mediaContainer.children('.media-placeholder').append(function(){
      var $ul = $('<ul></ul>'), i = 1;

      self.$areas.each(function(){
        $ul.append(
          '<li><a href="'+$(this).attr('href')+'">Hot Spot '+(i++)+'</a></li>'
        )
      });

      return $ul;
    });

    // Add ARIA properties
    this.$areas.attr({'role':'button', 'aria-controls':'revealed-text'});

    // Hook up image map area clicks
    $mediaContainer.on('click', 'area, a', function(event){
      self.onClick_$mediaContainer($(this));

      event.preventDefault();
    });

    return this;
  },
  onClick_$mediaContainer: function($link){
    var href = $link.attr('href'), id = href.substring(href.indexOf('#')+1);

    $.scrollTo(this.$revealedText.html(this.hsHtml[id]));

    this.playAudio(id);
  }
};

xp.templates.ihsbuild = {
  // Shared props
  activeBuildIndex: 0,
  isHighlight: true,
  $panels: null,
  $highlights: null,
  $rewind: null,

  init: function($template, config){
    $.extend(this, xp.templates._common($template, config));

    // Set vars and get references
    var self = this, $mediaContainers = $template.find('div.media-container');
    this.$panels = $template.children('div');
    this.$rewind = $template.find('#rewind');
    this.parseConfig(config);

    // Set ARIA properties
    this.$rewind.attr('aria-hidden', true);
    this.$panels.each(function(i){
      if (i>0){
        $(this).attr('aria-hidden', true);
      }
    });

    // Only used doing content development (graphic description in place of image)
    $mediaContainers.children('.media-placeholder').each(function(){
      var $mediaPlaceholder = $(this), $map = $mediaPlaceholder.next('map');

      if ($map.length>0){
        $mediaPlaceholder.append(
          $('<ul></ul>').append(
            '<li><a href="'+$map.children('area').attr('href')+'">Next Build</a></li>'
          )
        );

        $map.remove();
      }
    });

    // Create highlights markup?
    if (this.isHighlight){
      self.$highlights = [];

      $template.find('area').each(function(i){
        var $area = $(this), $mediaContainer = $area.closest('.media-container');

        // Do not draw a highlight if we have a media-placeholder
        if ($mediaContainer.children('.media-placeholder').length>0){
          return true;
        }

        // Draw highlight
        $mediaContainer.prepend(
          xp.renderFragment('highlight', {
            index: i,
            href: $area.attr('href'),
            ariaControls: $area.attr('aria-controls'),
            alt: $area.attr('alt'),
            coords: $area.attr('coords') || $area[0].getAttribute('coords') // store coords from area (http://bugs.jquery.com/ticket/10828)
          })
        );

        // Remove area and maps from document
        $area.parent().prev().removeAttr('usemap').end().remove();
      });

      // Grab refs for hot spots
      this.$highlights = $template.find('a.highlight');
    }

    // Hook up areas, highlights, and links in media-placeholder elements
    $mediaContainers.on('click', 'area, a', function(event){
      self.onClick_$mediaContainers();

      event.preventDefault();
    });

    // Draw highlights after events hooked up
    if (this.isHighlight){
      self.drawHighlights();
    }

    // Hook up rewind
    this.$rewind.click(function(event){
      self.onClick_$rewind();

      event.preventDefault();
    });

    return this;
  },
  parseConfig: function(config){
    if (config.hasOwnProperty('isHighlight')){
      this.isHighlight = config.isHighlight;
    }
  },
  swapBuild: function(buildIndex){
    // Hide active panel
    this.$panels.hide().attr('aria-hidden', true);

    // Set new activeTabIndex
    this.activeBuildIndex = parseInt(buildIndex);

    // Show new panel
    $(this.$panels[this.activeBuildIndex]).show().attr('aria-hidden', false);

    // Show or hide rewind button
    if (this.activeBuildIndex==this.$panels.length-1){
      this.$rewind.show().attr('aria-hidden', false);
    }
    else{
      this.$rewind.hide().attr('aria-hidden', true);
    }

    this.playAudio(this.activeBuildIndex ? 'build'+this.activeBuildIndex : 'load');
  },
  drawHighlights: function(){
    this.$highlights.each(function(){
      var $highlight = $(this),
        imageContainer = {
          element:$highlight.parent(),
          width:$highlight.parent().width(),
          height:$highlight.parent().height()
        },
        coords = $highlight.data('coords').split(','),
        left, top, height, width;

      // Determine size and position (accounts for 3px borders)
      left = (coords[0]-3 < 0) ? 0 : coords[0]-3;
      top = (coords[1]-3 < 0) ? 0 : coords[1]-3;
      width = coords[2]-coords[0]+3;
      height = coords[3]-coords[1]+3;
      if (top+height+6 > imageContainer.height){
        top = imageContainer.height-height-6;
      }
      if (left+width+6 > imageContainer.width){
        left = imageContainer.width-width-6;
      }

      // Position tooltip on the right or left of highlight?
      if (imageContainer.width-(left+width) < 75){
        $highlight.find('span').css({right:'100%', left:'auto'});
      }
      else{
        $highlight.find('span').css({right:'auto', left:'100%'});
      }

      $highlight.css({
        left:left+'px',
        top:top+'px',
        width:width+'px',
        height:height+'px'
      }).show();
    });
  },
  onClick_$mediaContainers: function(){
    this.swapBuild(this.activeBuildIndex+1);
  },
  onClick_$rewind: function(){
    this.swapBuild(0);
  }
};

xp.templates.ilargehs = {
  init: function($template, config){
    return xp.templates.ihs.init($template, config);
  }
};

xp.templates.imultibuild = {
  // Shared props
  $tabsOl: null,
  $tabLinks: null,
  $tabPanels: null,
  $more: null,

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    var self = this;
    this.$tabsOl = $template.find('#tabs');
    this.$tabLinks = this.$tabsOl.find('a');
    this.$tabPanels = $template.find('div.tabpanel');
    this.$more = $('<a></a>', {
      href:'#build2', id:'more', 'aria-disabled':'false', text:'More'
    });

    // Add more button to page
    $template.find('#tabs').append(
      $('<li></li>', {role:'button', html:this.$more})
    );

    // Set ARIA properties
    this.$tabPanels.each(function(i){
      if (i>0){
        $(this).attr('aria-hidden', true);
      }
    });
    this.$more.attr('aria-controls', function(){
      return $.map(self.$tabPanels, function(n){
        return $(n).attr('id');
      }).join(' ');  // all existing panel ids (separated by a space)
    });

    this.$tabsOl.on('click', 'li.tab a', function(event){
      self.onClick_$tabLinks($(this));

      event.preventDefault();
    });
    this.$more.click(function(event){
      self.onClick_$more();

      event.preventDefault();
    });

    return this;
  },
  swapBuild: function(buildIndex){
    buildIndex = parseInt(buildIndex);

    this.stopAllMedia();

    // Hide active panel
    this.$tabPanels.hide().attr('aria-hidden', true);
    this.$tabLinks.parent().removeClass('active');

    // Show new panel
    $(this.$tabPanels[buildIndex]).show().attr('aria-hidden', false).focus();
    $(this.$tabLinks[buildIndex]).parent().addClass('active');

    // Toggle disabled state of more button
    if (buildIndex==this.$tabPanels.length-1){
      this.$more.attr('href', '#').addClass(
        'disabled'
      ).attr('aria-disabled', true);
    }
    else{
      this.$more.attr('href', '#build'+(buildIndex+2)).removeClass(
        'disabled'
      ).attr('aria-disabled', false);
    }

    this.playAudio(buildIndex ? 'build'+buildIndex : 'load');
    this.playFlash();
  },
  onClick_$tabLinks: function($tabLink){
    this.swapBuild(
      $tabLink.attr('aria-controls').replace('panel', '') - 1
    );
  },
  onClick_$more: function(){
    if (this.$more.hasClass('disabled')) return; // disabled, bail

    this.swapBuild(
      this.$tabPanels.filter('[aria-hidden=false]').attr('id').replace('panel', '')
    );
  }
},

xp.templates.isoftwaresimlaunch = {
  // Shared props
  autofill: false,
  isShowFeedback: true,
  isJustReturnedFromSim: false,
  submitEvent: false, // Executed on return from simulation, not on submit button press
  userAnswer: false, // boolean for correct
  feedback: {
    correct: 'Correct.',
    incorrect: 'Incorrect.'
  },
  $form: null,
  $submit: null,
  $feedback: null,

  init: function($template, config){
    $.extend(this, xp.templates._common($template, config));

    // Set vars and get references
    var self = this;
    this.$form = $template.find('form');
    this.$submit = $template.find('#submit');
    this.$feedback = $template.find('#feedback');
    this.parseConfig(config);

    // Autofill question?
    if (this.autofill){
      if (xp.pageData.context!='cont'){
        this.disableQuestion();
      }

      if (!this.submitEvent){
        this.showFeedback(this.getIsCorrect() ? 'correct' : 'incorrect');
        $template.find('footer').empty();
      }
    }

    return this;
  },
  onPageLifeCycleComplete: function(){
    if (this.isJustReturnedFromSim && this.submitEvent){
      this.submitEvent();
    }
  },
  parseConfig: function(config){
    if (config.hasOwnProperty('isShowFeedback')){
      this.isShowFeedback = config.isShowFeedback;
    }
    if (config.hasOwnProperty('userAnswer')){
      this.userAnswer = config.userAnswer;
      this.autofill = true;
    }
    if (config.hasOwnProperty('isSimCorrect')){
      this.isJustReturnedFromSim = true;
      this.userAnswer = config.isSimCorrect;
      this.autofill = true;
    }
    if (config.hasOwnProperty('submitEvent')){
      this.submitEvent = config.submitEvent;
    }
    if (config.hasOwnProperty('feedback')){
      if (config.feedback.hasOwnProperty('correct')){
        this.feedback.correct = config.feedback.correct;
      }
      if (config.feedback.hasOwnProperty('incorrect')){
        this.feedback.incorrect = config.feedback.incorrect;
      }
    }
  },
  getIsCorrect: function(){
    return this.userAnswer ? true : false;
  },
  disableQuestion: function(){
    this.$submit.prop('disabled', true);
  },
  enableQuestion: function(){
    this.$submit.prop('disabled', false);
  },
  showFeedback: function(type){
    if (this.isShowFeedback){
      $.scrollTo(
        this.$feedback.removeClass(
          'feedback-correct feedback-try-again feedback-incorrect'
        ).addClass(
          'feedback-'+type.replace('A', '-a') // tryAgain vs try-again
        ).html(this.feedback[type])
      );

      this.playAudio(type);
    }
  }
};

xp.templates.isoftwaresim = {
  // Shared props
  $window: $(window),
  $body: $('body'),
  $template: null,
  launchFile: xp.pageData.filename.replace('-sim', '')+'.htm',
  overallTask: '',
  $intro: null,
  $stepLis: null,
  $summary: null,
  passingPercent: 75,
  highlight: {text:'#ffffff', border:'#ff0000'},
  mode: {},
  steps: [],
  tryCount: 0,
  stepId: null, // id of the currently active step
  $mousePointer: null,
  $incorrect: null,
  $correct: null,
  correct: '',
  $stepBits: null,
  weight: {possible:0, user:0},
  stepWidth: 0,
  stepHeight: 0,
  $audioMouseClick: null,
  isSkipping: false,
  isCursorShim: true,
  panelWidth: 0,

  init: function($template, config){
    $.extend(this, xp.templates._common($template, config));

    // Set vars and get references
    $.extend(this, config);
    var self = this,
      timeout = null,
      $redoStep = null;
    this.$template = $template;
    this.$intro = $template.find('#intro');
    this.$steps = $template.find('#steps');
    this.$stepLis = this.$steps.find('li');
    this.$summary = $template.find('#summary');
    this.overallTask = $template.find('#steps header p').html();
    this.stepWidth = $template.width();
    this.stepHeight = $template.height();
    this.panelWidth = this.$intro.children('div.panel').width();

    // Add ARIA properties
    this.$intro.attr('aria-hidden', false);
    this.$stepLis.attr('aria-hidden', true);
    this.$summary.attr('aria-hidden', true);

    // Append Overall task text and a cancel button to intro panel
    this.$intro.children('div.panel').append(
      this.$steps.children('header').find('header h3').html('Task').end().html()
    ).children('p.buttons').append(
      xp.renderFragment('exit-button', {url:this.launchFile, text:'Cancel'})
    );

    // Add a redo task button to summary, and add mode data to each button
    // Also, add an exit button
    $redoStep = this.$summary.find('p.buttons a').data('mode', 'step');
    if (this.mode.task.isRedo){
      $redoStep.after(
        $redoStep.clone().data('mode', 'task').html('Redo TASK mode')
      );
    }
    $redoStep.parent().append(
      xp.renderFragment('exit-button', {url:this.launchFile, text:'Exit'})
    );
    if (!this.mode.step.isRedo){
      $redoStep.remove();
    }

    // Create pointer element (for show me animations) and add to page (initially hidden)
    this.$mousePointer = $(xp.renderFragment('mouse-pointer')).appendTo(this.$steps);

    // Create the audio element for the mouse click
    if (Modernizr.audio.ogg || Modernizr.audio.mp3){
      this.$audioMouseClick = $(xp.renderFragment('audio-mouse-click')).appendTo(this.$steps);
    }

    // Make elements unselectable (if not supported by CSS)
    if (!Modernizr.testAllProps('userSelect')){
      this.$template.find('img, map, area, .mouse-pointer, .highlight, .highlight span').attr(
        'unselectable', 'on'
      );
    }

    // Hook up all user interactions in the sim
    this.$template.on('click', 'img, area, a', function(e){
      // Click, right click, alt click, ctrl click, and shift click

      var $target = $(e.target);

      // Exit sim?
      if ($target.data('exit-sim')){
        self.hideShowMe();
        return (
          !$target.hasClass('x-exit') ||
          confirm('Are you sure you\'re ready to exit this simulation?')
        );
      }

      // Double click poses an interesting problem. Single click should
      // still trigger a negative response, but it is not always clear
      // in dif browsers when it is a single click vs a double. Here we
      // set a timeout, that is then cancelled by the double click
      // (if second click comes fast enough).
      if ($target.data('event')=='double-click'){
        if (!timeout){ // prevents a 2nd queue on 2nd click
          timeout = setTimeout(function(){
            self.onClick_$template(e);
            timeout = null;
          }, 1000);
        }
      }
      else{
        self.onClick_$template(e);
      }

      e.preventDefault();
    }).on('dblclick', 'area[data-event="double-click"], a[data-event="double-click"]', function(e){
      // Double click

      clearTimeout(timeout);
      timeout = null;
      self.onDoubleClick_$template(e);
      e.preventDefault();
    }).on('contextmenu', function(e){
      // Right click

      self.onContextMenu_$template(e);
      e.preventDefault();
    }).on('mouseover', 'area[data-event="mouse-over"], a[data-event="mouse-over"]', function(e){
      // Mouse Over

      self.onMouseOver_$template(e);
    });
    $(document).on('keydown', function(e){
      // Judge text entry, and shortcut keys

      self.onKeyDown_$document(e);
    });

    // Watch window resize
    this.$window.on('resize', function(e){
      self.onResize_$window(e);
    }).resize();

    $template.css('visibility', 'visible'); // Setup complete, show sim

    return this;
  },
  onPageLifeCycleComplete: function(){
    this.recordIsCorrect();
  },
  showStep: function(stepId){ // stepId can be an id or a jQuery object
    var $allSteps = $([]).add(this.$intro).add(this.$stepLis).add(this.$summary);

    // Weird show/hide attempts to eliminate the white flash between steps
    // I'd like to thank the IE z-index bug for this crazy absolute stuff
    $allSteps.css('position', 'absolute');
    $allSteps.filter(stepId).show().attr('aria-hidden', false);
    $allSteps.not(stepId).filter(':visible').fadeOut(1).attr('aria-hidden', true);
    setTimeout(function(){
      $allSteps.css('position', '');
    }, 100);
  },
  getStepNum: function(){
    return (this.stepId) ? parseInt(this.stepId.replace('#step', '')) : null;
  },
  getStep: function(){
    return (this.getStepNum()) ? this.steps[this.getStepNum()-1] : null;
  },
  get$stepLi: function(){
    return (this.stepId) ? this.$stepLis.filter(this.stepId) : this.$summary;
  },
  // Load the next logical step: step 1; next step in sequence; summary page
  loadNextStep: function(){
    var nextStepNum = (this.getStepNum() || 0) + 1;

    if (this.$stepLis.filter('#step'+nextStepNum).length===1){
      this.loadStep('#step'+nextStepNum);
    }
    else{
      this.loadSummary();
    }
  },
  loadStep: function(stepId){
    this.unloadStep();

    if (!stepId){
      this.loadNextStep();
      return;
    }
    if (stepId=='#summary'){
      this.loadSummary();
      return;
    }

    this.stepId = stepId;
    this.tryCount = 0;

    var self = this,
      $stepLi = this.get$stepLi(),
      $panel = $stepLi.find('div.panel'),
      $areas = $stepLi.find('area'),
      $input = $stepLi.children('input'),
      step = this.getStep(),
      mode = this.mode.current;

    if ($stepLi.length==0){
      this.loadNextStep();
      return;
    }

    // Create header and show buttons (only once per step)
    if ($panel.children('h4').length==0){
      $panel.prepend($('<h4></h4>')).append(
        $('<a></a>', {
          'class':'button show', href:'#show', text:'Show', 'aria-controls':'highlight'
        })
      ).append(
        $(
          xp.renderFragment('exit-button', {url:this.launchFile, text:'X'})
        ).addClass('x-exit').attr('title', 'Exit')
      );
    }

    // Set header text (every time, cause it can change)
    $panel.children('h4').html(mode.charAt(0).toUpperCase() + mode.slice(1));

    // Hide or show 'Show' button
    $panel.children('a.show').toggle(this.mode[mode].isShow).attr(
      'aria-hidden', !this.mode[mode].isShow
    );

    // Set instructions text
    $panel.children('p').html(
      step[mode].instructions || this.overallTask
    );

    // Setup judge text hotspots
    $areas.filter('[data-is-judge]').attr('href', '#judge');

    // Create links, for hacking in non-standard cursors (only once per step)
    // @todo Is this too hacky? Is it even worth it?
    if (this.isCursorShim){
      if ($stepLi.children('a.cursor').length==0){
        // Default is 'pointer', which is browser automatic
        // So, data-cursor attribute show be left of html out in that case
        $areas.filter('[data-cursor]').each(function(){
          var $area = $(this), $a, eventType = $area.data('event');

          $.extend($area, self.getLeftTopWidthHeight($area));

          $a = $('<a></a>', {'class':'cursor', 'href':self.getHref($area)}).css({
            left: $area.left+'px',
            top: $area.top+'px',
            width: $area.width+3+'px',
            height: $area.height+3+'px',
            'aria-controls': $area.attr('aria-controls'),
            cursor: $area.data('cursor')
          }).appendTo($stepLi);

          // Add custom event data attribute to link?
          if (eventType){
            $a.attr('data-event', eventType);
          }
        });
      }
    }

    // Create text entry field? (only once per step)
    if ($input.length==0 && step.textEntry!==null){
      $input = $('<input></input>', {
        type: (step.textEntry.isPassword) ? 'password' : 'text'
      }).css({
        left: step.textEntry.left+'px',
        top: step.textEntry.top+'px',
        width: step.textEntry.width+'px',
        height: step.textEntry.height+'px'
      }).appendTo($stepLi);
    }

    this.showStep(this.stepId);

    // Increment possible weight
    this.weight.possible += this.getStep().weight;

    this.showCorrect();

    this.setFocus();
  },
  unloadStep: function(){
    if (!this.stepId){return;}

    var step = this.getStep(),
      $stepLi = this.get$stepLi(),
      mode = this.mode.current;

    this.hideShowMe();
    this.hideHighlights();
    this.removeIncorrect();

    // Remove highlights
    $stepLi.children('.highlight').remove();

    // Reset textEntry
    this.textEntry = {judgeKeys:[], patterns:[]};

    if (!this.isSkipping){
      // Is there correct feedback?
      if (step[mode].correct!='' && (step[mode].correctOnTry==3 || step[mode].correctOnTry-1==this.tryCount)){
        this.correct = step[mode].correct;
      }

      // Increment user weight?
      if (this.tryCount<3) {
        this.weight.user += step.weight;
      }
    }

    this.stepId = null;
  },
  showMe: function(){
    var self = this,
      $stepLi = this.get$stepLi(),
      $target = $stepLi.find(
        $stepLi.children('input').length > 0 ? 'input' : 'area'
      ).first(),
      target = this.getLeftTopWidthHeight($target),
      shrinkWidthBy = Math.round(this.$mousePointer.width() * .25), // 25%
      shrinkHeightBy = Math.round(this.$mousePointer.height() * .25);  // 25%

    this.hideShowMe();
    this.showHighlights();

    this.$mousePointer.show().animate({
      top: target.top + target.height / 2,
      left: target.left + target.width / 2
    }, 2000).animate({ // shrink (simulate down press)
      top:'-=3px', height:'-='+shrinkHeightBy+'px', width:'-='+shrinkWidthBy+'px'
    }, 250, function(){
      if (self.$audioMouseClick){
        self.$audioMouseClick.get(0).play();
      }
    }).animate({  // grow (back to original size)
      top:'+=3px', height:'+='+shrinkHeightBy+'px', width:'+='+shrinkWidthBy+'px'
    }, 250).delay(300).animate({
      opacity:'0'
    }, 150, function(){
      var interval, pattern = '', progress = 0;

      // Animate typing text. Clear out text when done.
      if (self.getTagName($target)=='input'){
        pattern = self.getStep().textEntry.patterns[0].text;

        $target.val('');

        interval = setInterval(function(){
          if (self.$mousePointer.queue().length > 0){
            clearInterval(interval);
            return;
          }

          $target.val(pattern.substring(0, progress++) + (progress & 1 ? '_' : ''));
          if (progress > pattern.length){
            clearInterval(interval);

            setTimeout(function(){
              $target.val('');
              self.hideHighlights(true);
            }, 2000);
          }
        }, 150);
      }
      else{
        self.hideHighlights(true);
      }

      self.hideShowMe();
    });
  },
  hideShowMe: function(){
    this.$mousePointer.clearQueue().stop().hide().attr('style', '');

    this.get$stepLi().find('input').val('');
  },
  skipStep: function(){
    var $stepLi = this.get$stepLi();

    this.isSkipping = true;

    if ($stepLi.children('input').length>0){
      this.loadNextStep();
    }
    else{
      this.loadStep(this.getHref($stepLi.find('area').first()));
    }

    this.isSkipping = false;
  },
  loadSummary: function(){
    this.unloadStep();

    this.showStep(this.$summary);

    this.showCorrect();

    this.recordIsCorrect();
  },
  userError: function(){
    if (!this.stepId){return;}

    var step = this.getStep();

    this.tryCount++;

    // Draw highlight?
    if (this.tryCount>=step[this.mode.current].highlightOnTry){
      this.showHighlights();
    }

    // Show Feedback
    this.showIncorrect();
  },
  disableStep: function(){
    var $stepLi = this.get$stepLi();

    $stepLi.addClass('disabled').attr('aria-disabled', true);
    this.$stepBits = $stepLi.find('map').remove();
  },
  enableStep: function(){
    var $stepLi = this.get$stepLi();

    $stepLi.removeClass('disabled').attr('aria-disabled', false);

    if (this.$stepBits){
      $stepLi.prepend(this.$stepBits);
      this.$stepBits = null;
    }

    this.setFocus();
  },
  getIsDisabled: function(){
    return this.get$stepLi().hasClass('disabled');
  },
  showCorrect: function(){
    if (this.correct!=''){
      this.$correct = $(xp.renderFragment('correct', {
        text: this.correct
      }));

      this.get$stepLi().find('div.panel').hide().attr(
        'aria-hidden', true
      ).end().prepend(this.$correct);

      this.disableStep();
    }

    this.correct = '';
  },
  removeCorrect: function(){
    if (this.$correct){
      this.$correct.remove();
      this.$correct = null;

      this.get$stepLi().find('div.panel').show().attr('aria-hidden', false);

      this.enableStep();
    }
  },
  showIncorrect: function(){
    var step = this.getStep(),
      mode = this.mode.current,
      feedback = step[mode].incorrect[(this.tryCount==1) ? 0 : 1];

    if (feedback!=''){
      if (this.$incorrect){
        this.$incorrect.children('p').html(feedback);
      }
      else{
        this.$incorrect = $(xp.renderFragment('incorrect', {
          text: feedback
        }));

        // Remove 'Skip' button?
        if (!this.mode[mode].isSkip){
          this.$incorrect.find('a.skip').remove();
        }

        this.get$stepLi().find('div.panel').append(this.$incorrect);
      }
    }
  },
  removeIncorrect: function(){
    if (this.$incorrect){
      this.$incorrect.remove();
      this.$incorrect = null;
    }
  },
  showHighlights: function(){
    var self = this,
      $stepLi = this.get$stepLi(),
      $highlights = $stepLi.children('.highlight');

    if ($highlights.length==0){
      $stepLi.find('area, input').each(function(i){
        var $target = $(this),
          $highlight,
          $tooltip,
          ltwh = self.getLeftTopWidthHeight($target),
          tooltip = 'Click';

        // Create highlight elements [with custom colors] and add to page (initially hidden)
        $highlight = $(xp.renderFragment('highlight')).css({
          'border-color':self.highlight.border
        }).find('span').css({
          'background':self.highlight.border, 'color':self.highlight.text
        }).end().appendTo($stepLi);

        if (self.getTagName($target)=='area'){
          $highlight.attr({
            id: 'highlight'+i,
            href: $target.attr('href'),
            alt: $target.attr('alt'),
            'data-event': $target.data('event') || '',
            'aria-controls': $target.attr('aria-controls')
          });

          tooltip = $target.data('event') || 'Click';
          tooltip = tooltip.replace('-', ' ');
          tooltip = tooltip.replace(/\w\S*/g, function(txt){
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          });
          tooltip = tooltip.replace(' ', '&nbsp;');
        }
        else{
          tooltip = 'Type "' + self.getStep().textEntry.patterns[0].text + '".';
        }

        $tooltip = $highlight.find('span');

        // Set tooltip text
        $tooltip.html(tooltip);

        // Position tooltip on the top [default] or bottom of highlight?
        if (ltwh.top < 30){
          $tooltip.addClass('bottom');
        }
        else{
          $tooltip.removeClass('bottom');
        }

        // Position tooltip on the left [default] or right of highlight?
        if (ltwh.left > self.stepWidth * .5){
          $tooltip.addClass('right');
        }
        else{
          $tooltip.removeClass('right');
        }

        // Position highlight
        $highlight.css({
          left: ltwh.left+'px',
          top: ltwh.top+'px',
          width: ltwh.width+'px',
          height: ltwh.height+'px'
        });

        $highlights = $highlights.add($highlight);
      });
    }

    if ($highlights.length>0 && $highlights.first().is(':hidden')){
      if (Modernizr.ltie9){
        $highlights.show().attr('aria-hidden', false);
      }
      else{
        $highlights.fadeIn('fast').attr('aria-hidden', false);
      }
    }
  },
  hideHighlights: function(isFade){
    var $stepLi = this.get$stepLi(),
      $highlights = $stepLi.children('.highlight');

    if ($highlights.length>0 && !$highlights.eq(0).is(':hidden')){
      if (isFade){
        $highlights.fadeOut('fast');
      }
      else{
        $highlights.hide();
      }
    }
  },
  getLeftTopWidthHeight: function($element){
    var coords, left, top, height, width;

    if (this.getTagName($element)=='area'){
      coords = $element.attr('coords') || $element[0].getAttribute('coords'), // http://bugs.jquery.com/ticket/10828
      coords = coords.split(',');

      left = coords[0];
      top = coords[1];
      width = coords[2]-coords[0];
      height = coords[3]-coords[1];
    }
    else{
      left = $element.position().left;
      top = $element.position().top;
      width = $element.width();
      height = $element.height() + 3; // slight adjustment for text area chrome
    }

    // Accounts for 3px border/padding around $element
    left = (left-3 < 0) ? 0 : left-3;
    top = (top-3 < 0) ? 0 : top-3;
    width += 3;
    height += 3;
    if (top+height+6 > this.stepHeight){
      top = this.stepHeight-height-6;
    }
    if (left+width+6 > this.stepWidth){
      left = this.stepWidth-width-6;
    }

    return {'left':left, 'top':top, 'width':width, 'height':height};
  },
  setFocus: function(){
    var $stepLi = this.get$stepLi(),
      $input = $stepLi.find('input');

    if ($input.length>0){
      setTimeout(function(){
        $input.focus();
      }, 100);
    }
  },
  getTagName: function($element){
    return $element.prop('tagName').toLowerCase();
  },
  getHref: function($element){
    var href = $element.attr('href') || '';

    return href.substring(href.indexOf('#')); // thanks IE7=<
  },
  getIsCorrect: function(){
    return (Math.round((this.weight.user/this.weight.possible)*100) >= this.passingPercent);
  },
  recordIsCorrect: function(){
    var scoData = xp.scoData,
      pageData = xp.pageData,
      isCorrect = this.getIsCorrect();

    if (scoData){
      if (pageData.context=='cont'){
        scoData.content.pages[pageData.index].isSimCorrect = isCorrect;
      }
      else{
        scoData.test[pageData.context].questions[pageData.index].isSimCorrect = isCorrect;
      }
    }

    xp.saveScoData();
  },
  processMouseInteraction: function($target, isCorrectEvent){
    var href = this.getHref($target);

    if (this.getIsDisabled()){
      if (href=='#continue'){
        this.removeCorrect();
      }
    }
    else{
      if (isCorrectEvent && href=='#steps'){
        this.loadNextStep();
      }
      else if (isCorrectEvent && href=='#judge'){
        this.judgeTextEntry();
      }
      else if (isCorrectEvent && href=='#show'){
        this.showMe();
      }
      else if (isCorrectEvent && href=='#skip'){
        this.skipStep();
      }
      else if (isCorrectEvent && (href=='#summary' || href.match(/#step\d+/))){
        this.loadStep(href);
      }
      else{
        this.userError();
      }
    }
  },
  judgeTextEntry: function(){
    var step = this.getStep(),
      $stepLi = this.get$stepLi(),
      userText = $stepLi.find('input').first().val(),
      pattern = '',
      i = 0;

    if (step && step.textEntry){
      for (i=0; i<step.textEntry.patterns.length; i++){
        pattern = step.textEntry.patterns[i];

        if (pattern.text=='*' || (pattern.text===userText) || (!pattern.isCaseSensitive && pattern.text.toLowerCase()===userText.toLowerCase())){
          this.loadNextStep();
          return;
        }
      }

      this.userError();
    }
  },
  onClick_$template: function(e){
    var $target = $(e.target);

    if (this.getTagName($target)=='input'){
      return; // exit early (user clicked on text entry area)
    }

    // Set a new mode?
    this.mode.current = $target.data('mode') || this.mode.current;

    this.processMouseInteraction(
      $target,
      (function(){
        switch($target.data('event')){
          case 'ctrl-click':return e.ctrlKey;
          case 'alt-click':return e.altKey;
          case 'shift-click':return e.shiftKey;
          case 'right-click':return false;
          case 'double-click':return false;
          default:return true;
        }
      }())
    );
  },
  onDoubleClick_$template: function(e){
    this.processMouseInteraction($(e.target), true);
  },
  onContextMenu_$template: function(e){
    var isCorrect = false,
      $target = $(e.target),
      $stepLi = null, $area = null, ltwh = null, mouseX = 0, mouseY = 0;

    // IE<9 can't detext a contextmenu over an AREA. Hack it in.
    if (this.getTagName($target)=='img'){
      $stepLi = this.get$stepLi();
      $area = $stepLi.find('area[data-event="right-click"]');

      if ($area.length>0){
        ltwh = this.getLeftTopWidthHeight($area);
        mouseX = e.pageX - $stepLi.offset().left;
        mouseY = e.pageY - $stepLi.offset().top;

        isCorrect = (
          mouseX >= ltwh.left && mouseX <= ltwh.left+ltwh.width &&
          mouseY >= ltwh.top && mouseY <= ltwh.top+ltwh.height
        );

        if (isCorrect){
          $target = $area; // remap target to area
        }
      }
    }
    else {
      isCorrect = ($target.data('event')=='right-click');
    }

    this.processMouseInteraction($target, isCorrect);
  },
  onMouseOver_$template: function(e){
    this.processMouseInteraction($(e.target), true);
  },
  onKeyDown_$document: function(e){
    var $target = $(e.target),
      step = this.getStep(),
      i = 0,
      shortcut = null,
      isJudgeTextEntry = false;

    // Shortcut key pressed? (does not ever trigger an error)
    if (step && step.shortcutKeys!=null){
      for (i=0; i<step.shortcutKeys.length; i++){
        shortcut = step.shortcutKeys[i];

        if (e.altKey==shortcut.isAlt && e.ctrlKey==shortcut.isCtrl && e.shiftKey==shortcut.isShift && e.which==shortcut.keyCode){
          e.preventDefault();

          switch(shortcut.action){
            case 'judge':
              isJudgeTextEntry = true;
              break;
            case 'next':
              this.loadNextStep();
              break;
            default:
              this.loadStep('#'+shortcut.action);
          }
        }
      }
    }

    // Judge entered text entry?
    if (this.getTagName($target)=='input' && (isJudgeTextEntry || (step.textEntry.isEnter && e.which==13) || (step.textEntry.isTab && e.which==9))){
      this.judgeTextEntry();
    }
  },
  onResize_$window: function(e){
    // Position the panel to the right of the screenshot if there is enough room
    if (this.$window.width() >= (this.stepWidth + this.panelWidth + 50)){
      this.$body.removeClass('isoftwaresim-thin').addClass('isoftwaresim-wide');
    }
    else{
      this.$body.removeClass('isoftwaresim-wide').addClass('isoftwaresim-thin');
    }
  }
};

xp.templates.testintro = {
  // Shared props
  context: '',

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    this.context = $template.data('context');

    $template.find('dl').append(
      xp.renderFragment('scores', {
        userScore: xp.scoData.test[this.context].score.user,
        passingScore: xp.scoData.test[this.context].score.passing,
        status: this.getTestStatus()
      })
    );

    this.createTestStructure();

    if (this.context=='pre' && xp.isTestCompleted('pre')){
      // Kill next button [for pre] if pre has already been taken
      $('#main-menu').find('li.next').remove();
    }
    else{
      // Hijack Next page link with new first question
      $('#main-menu').find('li.next a').attr(
        'href',
        xp.scoData.test[this.context].questions[0].filename+'.htm'
      );
    }

    return this;
  },
  getTestStatus: function(){
    var i = 0, visitedCount = 0,
      testData = xp.scoData.test[this.context],
      questionCount = testData.questions.length;

    for (i=0; i<questionCount; i++){
      visitedCount += (testData.questions[i].isVisited) ? 1 : 0;
    }

    if (visitedCount==0){
      return 'Not Attempted';
    }
    else if (visitedCount>0 && visitedCount<questionCount){
      return 'Incomplete';
    }
    else{
      if (testData.score.user >= testData.score.passing){
        return 'Passed';
      }
      else{
        return 'Failed';
      }
    }
  },
  createTestStructure: function(){
    var i = 0, topicQuestions = [],
      topicCount = xp.scoData.content.topics.length,
      questionCount = xp.scoData.test.post.questions.length,
      isPreTest = ('pre' in xp.scoData.test),
      isRandomize = xp.scoData.test.isRandomize;

    if (questionCount==0){
      for (i=0; i<topicCount; i++){
        topicQuestions = xp.scoData.content.topics[i].questions;
        if (topicQuestions.length>0){
          // Randomize which question goes to pre and which to post
          if (isRandomize && this.getRandBool()){
            topicQuestions.reverse();
          }
          if (isPreTest){
            xp.scoData.test.pre.questions.push(topicQuestions[0]);
          }
          xp.scoData.test.post.questions.push(topicQuestions[topicQuestions.length-1]);

          // Randomize question order within each test
          if (isPreTest && isRandomize && this.getRandBool()){
            xp.scoData.test.pre.questions.reverse();
          }
          if (isRandomize && this.getRandBool()){
            xp.scoData.test.post.questions.reverse();
          }
        }
      }
    }

    if (this.context=='post'){
      // Initialize post test, as it can be taken multiple times
      for (i=0; i<questionCount; i++){
        xp.scoData.test.post.questions[i].weight.user = 0;
        delete xp.scoData.test.post.questions[i].userAnswer;
      }
    }
  },
  getRandBool: function(){
    return (Math.round(Math.random()));
  }
};

xp.templates.testsummary = {
  // Shared props
  context: '',

  init: function($template){
    $.extend(this, xp.templates._common($template));

    // Set vars and get references
    var self = this, $results = $template.find('section.results table');
    this.context = $template.data('context');

    // Intro message
    $template.find('section.message').prepend(
      function(){
        return (self.getIsPassed())
          ? 'Congratulations! You got a passing score. '
          : 'Sorry, you didn&#39;t get a passing score. ';
      }
    );

    // User score
    $template.find('section.scores dd:last-child').html(
      xp.scoData.test[this.context].score.user + '%'
    );

    // Results table
    if ($results.find('tbody').length==0){
      $results.append('<tbody>');
    }
    $results.find('tbody').append((function(){
      var html = '', i = 0, question = null, isCorrect = false,
        topicCount = xp.scoData.content.topics.length;

      for (i=0; i<topicCount; i++){
        if (xp.scoData.content.topics[i].questions.length>0){
          question = self.getTopicTestQuestion(i);
          isCorrect = (question.weight.max == question.weight.user);

          html += xp.renderFragment('results', {
            'class': (isCorrect) ? 'correct' : 'incorrect',
            filename: question.filename,
            x: (isCorrect) ? '&nbsp;' : 'X',
            topicName: xp.scoData.content.topics[i].name
          });
        }
      }

      return html;
    }()));

    // What To Do Next
    $template.find('section.what-to-do-next').append(
      xp.renderFragment((self.getIsPassed()) ? 'pass' : 'fail')
    );

    return this;
  },
  getTopicTestQuestion: function(topicIndex){
    // Return the test question object, used in this test, that is associated
    // with the given content topic
    var i = 0, j = 0,
      topicQuestions = xp.scoData.content.topics[topicIndex].questions,
      testQuestions = xp.scoData.test[this.context].questions,
      questionCount = testQuestions.length;

    for (i=0; i<questionCount; i++){
      for (j=0; j<topicQuestions.length; j++){
        if (testQuestions[i].filename==topicQuestions[j].filename){
          return testQuestions[i];
        }
      }
    }

    return null;
  },
  getIsPassed: function(){
    var test = xp.scoData.test[this.context];

    return (test.score.user >= test.score.passing);
  }
};