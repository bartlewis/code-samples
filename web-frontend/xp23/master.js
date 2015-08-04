/*
  Conventions & Notes

  1) References to jQuery DOM objects start with "$". (example: $ul or $lis)
 */

$(function(){
  var htmlData = $('html').data(),
    isJsonString = function(str){
      try{
        JSON.parse(str);
      }
      catch(e){
        return false;
      }
      return true;
    };

  // Does the given scoData have a "build" that matches the "build" of the html?
  // Non-SCO pages, like glossary and resources always return true. Thier build
  // numbers are different. This is why we check for data-sco in the HTML tag.
  function isValidScoData(scoData){
    return (!htmlData.hasOwnProperty('sco') || htmlData.build==scoData.build);
  }

  // First try to get scoData from an LMS, then try window.name, then
  // sessionStorage. If all fail, use the initial scoData from included
  // JS file.
  if (parent.scoData && isValidScoData(parent.scoData)){
    // Deep clone to prevent IE freed script errors
    // @link http://stackoverflow.com/a/122704/158651
    xp.scoData = $.extend(true, {}, parent.scoData);
  }
  else{
    if (window.name && isJsonString(window.name) && isValidScoData(JSON.parse(window.name))){
      xp.scoData = JSON.parse(window.name);
    }
    else{
      if (Modernizr.sessionstorage && sessionStorage.getItem('scoData')){
        if (isValidScoData(JSON.parse(sessionStorage.getItem('scoData')))){
          xp.scoData = JSON.parse(sessionStorage.getItem('scoData'));
        }
      }
    }
  }

  // Create a reference from parent.scoData to xp.scoData
  // Keeps parent.scoData up to date [and in real time] with xp.scoData
  if (typeof parent.scoData != 'undefined'){
    parent.scoData = xp.scoData;
  }

  // Add sco id to scoData
  if (xp.scoData && !('id' in xp.scoData) && htmlData.hasOwnProperty('sco')){
    xp.scoData.id = htmlData.sco;
  }

  // Always save scoData on window unload. IE6 and IE7 MUST save the data to
  // win.name within the onunload event, or it will not persist!
  // http://stackoverflow.com/a/12625751/158651
  $(window).on('unload', function(){
    xp.saveScoData();
  });

  // Ping the XP-23 Review tool
  if (top!=window && top['xp23Ping']){
    top.xp23Ping($('html').data('page') || 0);
  }

  Modernizr.addTest('ltie9', function(){
    // Use IE CSS conditionals to test for less than IE9.
    // Note: Only to be used when feature detection not possible!
    // @link https://gist.github.com/padolsey/527683

    var ie = (function(){
      var undef,
        v = 3,
        div = document.createElement('div'),
        all = div.getElementsByTagName('i');

      while (
        div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->',
        all[0]
      );

      return v > 4 ? v : undef;
    }());

    return (ie && ie < 9);
  });

  // Startup SCO/page
  xp.pageLoad();
});

// Create a global namespace for XP
var xp = {
  pageConfig: {},
  templates: {},
  fragments: {},
  // scoData persists across pages, for the entire session. Multiple
  // sessions if hooked up to an LMS.
  scoData: null,
  // In addition to being called onunload, this function is called manually whenever
  // changes are made to scoData, as onunload can be unrealiable in mobile safari.
  saveScoData: function(){
    if (this.scoData){
      // Persist scoData in all available mechanisms (fault tolerance)
      window.name = JSON.stringify(this.scoData);
      if (Modernizr.sessionstorage){
        sessionStorage.setItem('scoData', JSON.stringify(this.scoData));
      }
    }
  },
  // Cache for vars within a single page lifecycle
  // The store comes ready with some items we'll almost always need.
  pageData: {
    filename: (function(){
      var filename = window.location.pathname.split('/').pop();
      return filename.substring(0, filename.lastIndexOf('.')) || 'index';
    }()),
    context: 'cont', // set in pageLoad
    index: 0 // set in pageLoad
  },
  getLayoutType: function(){
    if (Modernizr.mq('only screen and (max-width: 480px), only screen and (max-device-width: 480px)')){
      return 'phone';
    }
    else{
      return 'desktop';
    }
  },
  // Test the given element to see if it is in view.
  // http://stackoverflow.com/questions/487073/jquery-check-if-element-is-visible-after-scroling/
  isScrolledIntoView: function(el){
    var $el = $(el),
      $win = $(window),
      docViewTop = $win.scrollTop(),
      docViewBottom = docViewTop + $win.height(),
      top = $el.offset().top,
      bottom = top + $el.height();

    return ((bottom >= docViewTop) && (top <= docViewBottom)
      && (bottom <= docViewBottom) && (top >= docViewTop));
  },
  // If all questions [in the given test] have a userAnswer, the test is done.
  isTestCompleted: function(context) {
    var i = 0,
      questions,
      questionCount = 0,
      questionCompletedCount = 0;

    if (context in this.scoData.test){
      questions = this.scoData.test[context].questions;

      for (i=0; i<questions.length; i++){
        questionCount++;
        if ('userAnswer' in questions[i]){
          questionCompletedCount++;
        }
      }

      return (questionCount==questionCompletedCount);
    }

    return false;
  },
  // Get an html script fragment
  getFragment: function(name){
    if (!(name in this.fragments)){
      this.fragments[name] = $.trim($('#'+name+'-fragment').html());
    }

    return this.fragments[name];
  },

  // Parse/Render an html fragment
  renderFragment: function(name, replacements){
    var frag = this.getFragment(name), reg;

    if (replacements){
      $.each(replacements, function(key, val){
        reg = new RegExp('{{'+key+'}}', 'ig');

        frag = frag.replace(reg, val)
      });
    }

    return frag;
  },
  pageLoad: function(){
    var self = this, $template = $('section').filter('[class*="template-"]'),
      questionData = null, $body = $('body');

    // skip-to-main link
    $('#skip-to-main').focusin(function(){
      $(this).animate({'margin-top':0}, 200);
    }).focusout(function(){
      $(this).animate({'margin-top':'-1.5em'}, 200);
    }).click(function(){
      $('#main').focus().css('backgroundColor','#ffff99').animate({'backgroundColor':'#ffffff'}, 1500);
    });

    // Now that we have scoData, store "context" and "index" in pageData
    this.pageData.context = (function(){
      function is(context){
        var i, pageCount, filename = self.pageData.filename;

        if (!self.scoData || !(context in self.scoData.test)){
          return false;
        }

        pageCount = self.scoData.test[context].questions.length;
        for (i=0; i<pageCount; i++){
          if (self.scoData.test[context].questions[i].filename==filename.replace('-sim', '')){
            return context;
          }
        }
        return false;
      }

      return is('pre') || is('post') || 'cont';
    }());
    this.pageData.index = (function(){
      var i, pages, pageCount, filename = self.pageData.filename,
        context = self.pageData.context;

      if (self.scoData){
        if (context=='cont'){
          pages = self.scoData.content.pages;
        }
        else{
          pages = self.scoData.test[context].questions
        }

        pageCount = pages.length;
        for (i=0; i<pageCount; i++){
          if (pages[i].filename==filename.replace('-sim', '')){
            return i;
          }
        }
      }

      return -1;
    }());

    // Attempts to prevent users from navigating to a test question out of the
    // normal flow of the application: following an outside link; direct url entry; etc.
    (function(){
      var i, j, content, questions, topicLength,
        context = self.pageData.context,
        index = self.pageData.index,
        filename = self.pageData.filename;

      // Redirect user to first content page of sco
      function curbStomp(){
        window.location.replace(self.scoData.content.pages[0].filename+'.htm');
      }

      // User is trying to jump straight into a test question
      if (context=='cont' && index==-1 && self.scoData){
        content = self.scoData.content;
        topicLength = content.topics.length;

        for (i=0; i<topicLength; i++){
          for (j=0; j<content.topics[i].questions.length; j++){
            if (content.topics[i].questions[j].filename==filename){
              curbStomp();
            }
          }
        }
      }

      // User has started a test, but is trying to jump around within it
      if (context=='pre' || context=='post' && self.scoData){
        questions = self.scoData.test[context].questions;

        for (i=index-1; i>-1; i--){
          if (!('userAnswer' in questions[i])){
            curbStomp();
          }
        }
      }
    }());

    // Initialize template
    if ($template.length>0){
      this.pageData.template = $template.attr('class').match(/template-(\w*)/)[1];

      if (this.pageData.template in this.templates){
        // Mod pageConfig in a test
        if (this.pageData.context=='pre' || this.pageData.context=='post'){
          this.pageConfig.tryCount = 1; // no tryAgain feedback

          // Has the user already answered this test question?
          questionData = this.scoData.test[this.pageData.context].questions[this.pageData.index];
          if ('userAnswer' in questionData){
            // Yes, send in user's answer to autofill
            this.pageConfig.userAnswer = questionData.userAnswer;

            // Only show feedback and correct options when test is completed
            this.pageConfig.isShowFeedback = (
              this.scoData.test.isShowFeedback && this.isTestCompleted(this.pageData.context)
            );
            this.pageConfig.isShowCorrectOptions = (
              this.scoData.test.isShowCorrectOptions && this.isTestCompleted(this.pageData.context)
            );
          }
          else{
            // No, hijack submit event
            this.pageConfig.submitEvent = function(){
              var questions = self.scoData.test[self.pageData.context].questions;

              // Record question score
              self.recordTestQuestion();

              // Auto-advance to next question
              window.location = (self.pageData.index < questions.length-1)
                ? questions[self.pageData.index+1].filename+'.htm'
                : self.pageData.context+'-test-summary.htm';
            };
          }
        }
        else{
          if (this.pageData.index > -1){
            questionData = this.scoData.content.pages[this.pageData.index];
          }
        }

        // Pass isSimCorrect in through pageConfig
        if (questionData && ('isSimCorrect' in questionData)){
          this.pageConfig.isSimCorrect = questionData.isSimCorrect;
        }

        // Execute the template and save reference to template object
        this.pageData.templateOb = this.templates[this.pageData.template].init(
          $template,
          this.pageConfig
        );
      }
      else{
        // This template does not have an associated JS object
        this.templates._common($template, this.pageConfig);
      }
    }

    // Glossary & Resources
    (function(){
      var isGlossary = $body.hasClass('glossary');
      var isResources = $body.hasClass('resources');

      if (isGlossary || isResources){
        $body.find('header').append($((function(){
          var html = '<ul>'+self.renderFragment('close');

          if (window.print){
            html += self.renderFragment('print');
          }

          return html+'</ul>';
        }())).on('click', 'a', function(event){
          var linkTitle = $(this).attr('title').toLowerCase();

          if (linkTitle=='close'){
            if (self.scoData && ('previousPage' in self.scoData) && self.scoData.previousPage!='' && ('id' in self.scoData)){
              window.location = '../sco_'+self.scoData.id+'/'+self.scoData.previousPage+'.htm';
            }
            else{
              window.history.back();
            }
          }
          else if (linkTitle=='print'){window.print();}

          event.preventDefault();
        }));
      }

      if (isGlossary){
        // Hook up glossary pretty scrolling
        $body.find('nav').on('click', 'a', function(event){
          $.scrollTo($($(this).attr('href')), 'slow');

          event.preventDefault();
        });
      }
    }());

    // Main menu and tools menu
    (function(){
      var $toolsUl = $('#tools-menu');

      if ($toolsUl.length==0) return; // doesn't exist, bail

      var $toolsLi = $toolsUl.parent();

      // Tell aria that toolsMenu is hidden
      $toolsLi.attr('aria-expanded', false);
      $toolsUl.attr('aria-hidden', true);

      // Hide/Show tools menu
      function hideTools(){
        $toolsLi.removeClass('checked').attr('aria-expanded', false);
        $toolsUl.hide(200, 'swing').attr('aria-hidden', true);
      }
      function showTools(){
        $toolsLi.addClass('checked').attr('aria-expanded', true);
        $toolsUl.show(200, 'swing').attr('aria-hidden', false);
      }

      // Hook up button presses, mouseleaves, and etc to show/hide
      $toolsUl.prev().click(function(event){
        if ($toolsUl.is(':visible')){hideTools();}
        else{showTools();}

        event.preventDefault();
      });
      $toolsUl.mouseleave(function(){hideTools();});
      $toolsLi.next().find('a').focus(function(){hideTools();}); // for when tabbing

      // Add buttons to tools menu
      $toolsUl.append((function(){
        var html = '';

        if (self.scoData.toolbar.isPrint && window.print){
          html += self.renderFragment('print');
        }

        if (self.scoData.toolbar.isBookmark){
          html += self.renderFragment('bookmark');

          if (self.scoData.bookmark){
            html += self.renderFragment('open-bookmark', {bookmark: self.scoData.bookmark});
          }
        }

        return html;
      }())).on('click', 'a', function(event){
        var linkTitle = $(this).attr('title').toLowerCase();

        if (linkTitle=='print'){
          window.print();
          event.preventDefault();
        }
        else if (linkTitle=='bookmark'){
          hideTools();
          self.scoData.bookmark = self.pageData.filename+'.htm';
          self.saveScoData();

          event.preventDefault();
        }
        else if (linkTitle=='open bookmark'){
          self.scoData.bookmark = '';
          self.saveScoData();
        }
      });
    }());

    // Hook up back-to-top functionality
    (function(){
      var $backToTop = $('.back-to-top');

      if ($backToTop.length==0) return; // doesn't exist, bail

      var top = 0, left = 0,
        $win = $(window),
        $htmlBody = $('html, body'),
        $banner = $('header').filter('[role="banner"]');

      if (!Modernizr.opacity && $backToTop.css('filter')){
        // If using "filter", we need an inline style for fadeIn/fadeOut
        $backToTop.css('filter', $backToTop.css('filter'));
      }

      // Fade the link in
      function fadeIn(fromEvent){
        $backToTop.hide();

        $.doTimeout(fromEvent, 250, function(){
          if (!self.isScrolledIntoView($banner)){
            // We have to do this stupid absolutely positioned BS,
            // because position:relative currently has poor support
            // (IE6 & mobile). When position:relative has better
            // support on mobile, we can do away will all this
            // script and just use position:relative in the CSS.
            top = $win.scrollTop() - ($backToTop.height() + 20);
            top += (window.innerHeight) ? window.innerHeight : $win.height(); // iOS/jQuery bug
            left = $win.scrollLeft() - ($backToTop.width() + 20)
              + $win.width();
            $backToTop.css({'top':top+'px', 'left':left+'px'});

            $backToTop.fadeIn('slow');
          }
        });
      }
      $win.scroll(function(){
        fadeIn('scroll')
      });
      $win.resize(function(){
        fadeIn('resize')
      });

      // Pretty scrolling
      $backToTop.click(function(event){
        $htmlBody.animate({scrollTop:0}, 'slow');

        event.preventDefault();
      });
    }());

    // Done loading page, fire pageAfterLoad
    this.pageAfterLoad();
  },
  pageAfterLoad: function(){
    var context = this.pageData.context,
      index = this.pageData.index,
      $mainMenu = $('#main-menu');

    if (this.scoData){
      if (context=='cont' && index > -1){
        // Mark this page as visited
        this.scoData.content.pages[index].isVisited = true;
        delete this.scoData.content.pages[index].isSimCorrect;
      }
      else if (context=='pre' || context=='post'){
        // Mark this question as visited
        this.scoData.test[context].questions[index].isVisited = true;
        delete this.scoData.test[context].questions[index].isSimCorrect;

        // Update progress indicator
        $('header .progress').html(
          'Question '+(index+1)+' of '+this.scoData.test[context].questions.length
        ).attr('aria-valuenow', index+1);

        // Hijack navigation
        $mainMenu.find('li').removeClass('next').addClass('summary').find('a').attr({
          href: context+'-test-summary.htm', title: 'Back to Summary'
        }).html('Back to Summary');
      }

      // Now that all javascript has run, enable main menu navigation
      if (context=='cont' || this.isTestCompleted(context)){
        $mainMenu.find('a').css('display', 'block');
      }

      // Persist the current, and previous page (even with a refresh)
      if (this.scoData.currentPage != this.pageData.filename){
        this.scoData.previousPage = this.scoData.currentPage || '';
        this.scoData.currentPage = this.pageData.filename;
      }
    }

    this.pageLifeCycleComplete();
  },
  pageLifeCycleComplete: function(){
    var templateOb = this.pageData.templateOb;

    if (templateOb && ('onPageLifeCycleComplete' in templateOb)){
      templateOb.onPageLifeCycleComplete();
    }

    this.saveScoData();
  },
  recordTestQuestion: function(){
    var i = 0, questionCount = 0, testWeight = 0, userWeight = 0,
      templateOb = this.pageData.templateOb,
      context = this.pageData.context,
      index = this.pageData.index,
      testScore = 0;

    if (this.scoData && (context=='pre' || context=='post') && templateOb){
      // Record the users answer for this question
      this.scoData.test[context].questions[index].userAnswer = templateOb.userAnswer;

      // Record the users score for this question
      this.scoData.test[context].questions[index].weight.user = (
        templateOb.getIsCorrect()
      ) ? this.scoData.test[context].questions[index].weight.max : 0;

      // Update the overall test score (only if greater)
      questionCount = this.scoData.test[context].questions.length;
      for (i=0; i<questionCount; i++){
        testWeight += this.scoData.test[context].questions[i].weight.max;
        userWeight += this.scoData.test[context].questions[i].weight.user;
      }
      testScore = Math.round((userWeight/testWeight)*100);
      if (testScore > this.scoData.test[context].score.user){
        this.scoData.test[context].score.user = testScore;
      }

      // Lock user out of Pre-Test? Adds empty userAnswer data to all pre questions
      if (context=='post' && ('pre' in this.scoData.test)){
        questionCount = this.scoData.test.pre.questions.length;
        for (i=0; i<questionCount; i++){
          if (!('userAnswer' in this.scoData.test.pre.questions[i])){
            this.scoData.test.pre.questions[i].userAnswer = [];
          }
        }
      }
    }

    this.saveScoData();
  }
};