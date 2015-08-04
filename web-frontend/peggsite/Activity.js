define([
    'jquery', 'underscore', 'events', 'views/Base', './ActivityList',
    'TemplateEngine', 'text!./Activity.html', 'css!./Activity'
  ],
  function($, _, vent, BaseView, ActivityListView, TemplateEngine, template) {

    return BaseView.extend({
      className: 'view-user-activity',
      attributes: {
        tabindex: '-1' // needed to take advantage of onBlur
      },
      events: {
        'blur': 'onBlur',
        'click .activity-close': 'onClickClose'
      },
      template: TemplateEngine.compile(template),
      initialize: function(options) {
        _.bindAll(this);

        this.authUserModel = options.authUserModel;

        this.cache = {
          width: 0,
          $peggboard: null,
          $body: null
        };

        vent.on('activity:open', this.onActivityOpen, this);
        vent.on('activity:close', this.onActivityClose, this);

        this.on('beforeRender', this.onBeforeRender, this);
        this.on('afterRender', this.onAfterRender, this);

        $(window).on('resize.UserActivity',
          _.debounce(this.onWindowResizeStart, 100, true)
        );
      },
      cleanup: function() {
        vent.off(null, null, this);

        $(window).off('resize.UserActivity');
      },
      onBeforeRender: function() {
        this.insertView(
          new ActivityListView({
            collection: this.authUserModel.get('activity'),
            authUserModel: this.authUserModel
          })
        );
      },
      onAfterRender: function() {
        this.cache.width = this.$el.width();
        this.cache.$peggboard = this.$el.parents('.peggboard');
        this.cache.$body = $('body');
      },
      onActivityOpen: function($target) {
        this.open($target);
      },
      onActivityClose: function() {
        this.close();
      },
      onBlur: function(event) {
        var self = this, isFocusElementInThisDiv = false;

        // Fix for fussy Firefox. Mozilla reports a blur when a child element
        // receives the focus. We do not want this action to close the popup.
        // This checks to see if a child element did steal the focus, and then
        // hands the focus back to the DIV (so blur will still work properly).
        isFocusElementInThisDiv = (
          'explicitOriginalTarget' in event.originalEvent &&
          $(event.originalEvent.explicitOriginalTarget).closest(this.$el).length === 1
        );

        // Fix for fussy Chrome 39+. Like Mozilla above, Chrome 39 considers
        // a child element within this div to be a blur of this div.
        if (!isFocusElementInThisDiv) {
          isFocusElementInThisDiv = (
            'relatedTarget' in event &&
            $(event.relatedTarget).closest(this.$el).length === 1
          )
        }

        if (isFocusElementInThisDiv) {
          setTimeout(function() {
            self.$el.focus();
          }, 10);

          return;
        }

        this.close();
      },
      onClickClose: function(event) {
        event.preventDefault();

        this.close();

        return false;
      },
      onWindowResizeStart: function(event) {
        this.close();
      },
      open: function($target) {
        var targetOffset, peggboardOffset;

        if (this.getIsHidden()) {
          targetOffset = $target.offset();
          peggboardOffset = this.cache.$peggboard.offset();

          // Position activity feed just below activity button
          this.$el.css({
            left: Math.round(
              targetOffset.left - peggboardOffset.left - (this.cache.width * 0.48)
            ),
            top: Math.round(
              targetOffset.top - peggboardOffset.top + $target.height() + 11
            )
          }).show();

          this.$el.focus(); // set the focus, so the onblur event will fire

          // Update the 'date_viewed_activity'
          this.authUserModel.save(
            {'date_viewed_activity': 'now'}, {patch:true, wait:true}
          );

          // Prevent body scrolling while this is open
          this.cache.$body.css({
            'overflow': 'hidden',
            'width': this.cache.$body.innerWidth()
          });
        }
      },
      close: function() {
        if (!this.getIsHidden()) {
          this.$el.hide();

          this.cache.$body.css({
            'overflow': '',
            'width': ''
          });
        }
      },
      getIsHidden: function() {
        return this.$el.is(':hidden');
      }
    });
  }
);
