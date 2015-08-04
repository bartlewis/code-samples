define([
    'jquery','underscore', 'views/Base', './ActivityItem', 'moment'
  ],
  function($, _, BaseView, ActivityItemView, moment) {

    return BaseView.extend({
      tagName: 'ul',
      initialize: function(options) {
        _.bindAll(this);

        this.authUserModel = options.authUserModel;

        this.on('beforeRender', this.onBeforeRender, this);
        this.on('afterRender', this.onAfterRender, this);

        this.listenTo(this.collection, 'add', this.onAdd);
        this.listenTo(this.collection, 'request', this.onRequest);
        this.listenTo(this.collection, 'sync', this.onSync);
      },
      cleanup: function() {
        this.$el.off('scroll.UserActivity');
      },
      onBeforeRender: function() {
        // insert bootstrapped models into view
        this.collection.each(function(model) {
          this.insertActivityItem(model);
        }, this);
      },
      onAfterRender: function() {
        _.bindAll(this);

        this.$el.on('scroll.UserActivity',
          _.debounce(this.onScroll, 500)
        );
      },
      onAdd: function(model, collection, options) {
        var isAddFromPaging = false;

        if (options.isAddFromPaging) {
          isAddFromPaging = options.isAddFromPaging;
        }

        this.insertActivityItem(model, true, isAddFromPaging);
      },
      onRequest: function(collectionOrModel) {
        if (('models' in collectionOrModel)) {
          this.setIsBusy(true);
        }
      },
      onScroll: function() {
        if (!this.getIsBusy() && this.getIsScrolledToBottom(this.$el, 100)) {
          this.fetchActivityItems(this.collection.length);
        }
      },
      onSync: function(collectionOrModel) {
        if (('models' in collectionOrModel)) {
          this.setIsBusy(false);
        }
      },
      fetchActivityItems: function(offset) {
        this.collection.getPageByOffset(offset, {
          remove: false,

          // flag for insertActivityItem to always just insert at bottom of UL
          isAddFromPaging: true
        });
      },
      insertActivityItem: function(model, isRender, isAddFromPaging) {
        var view, $li, $lis, i,
            // dateAdded (in timestamp format) is used for sorting, to ensure
            // ordering remains constant.
            dateAdded = moment(model.get('date_added')).format('X');

        view = this.insertView(
          new ActivityItemView({
            model: model,
            authUserModel: this.authUserModel
          })
        );

        // Add a sort-order data param to the LI to help with in-place insertions
        view.$el.data('date-added', dateAdded);

        if (isRender) {

          view.$el.hide();

          view.render();

          if (!isAddFromPaging) {
            $lis = this.$el.find('li');

            // Search through the existing LIs. When we find an LI with a
            // older date-added than the one we are inputing, stop and INSERT
            // this new LI right there. Newest goes to top. Oldest at bottom.
            for (i = 0; i < $lis.length ; i++) {
              $li = $lis.eq(i);

              if ($li.data('date-added') < dateAdded) {
                $li.before(view.$el);
                break;
              }
            }
          }

          view.$el.show();
        }
      }
    });
  }
);
