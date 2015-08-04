define([
   'events', 'views/Base', 'views/Follow',
   'TemplateEngine', 'text!./ActivityItem.html'
 ],
  function(vent, BaseView, FollowView, TemplateEngine, template) {
    return BaseView.extend({
      tagName: 'li',
      template: TemplateEngine.compile(template),
      templateHelpers: function() {
        var self = this, config = this.getConfig();

        return {
          postUrl: function() {
            var url = config.rootUrl + '/';

            if (self.model.get('type') === 'mention') {
              url += self.model.get('extra').username;
            }
            else {
              url += self.authUserModel.get('username');
            }

            return url + '/post/' + self.model.get('extra').article_id;
          },
          previewThumbStyle: function(isUseDefault) {
            var articleTypeId = self.model.get('extra').article_type_id,
                style = '', ARTICLE_TYPE = config.ARTICLE_TYPE,
                DEFAULT_SCREENSHOT = config.DEFAULT_SCREENSHOT;

            if (articleTypeId) {
              style += 'background:transparent url(' + config.contentUrl + '/';

              if (isUseDefault) {
                // Which default screenshot to use?
                if (articleTypeId==ARTICLE_TYPE.IMAGE) {
                  style += DEFAULT_SCREENSHOT.IMAGE;
                }
                else if (articleTypeId==ARTICLE_TYPE.YOUTUBE) {
                  style += DEFAULT_SCREENSHOT.YOUTUBE;
                }
                else if (articleTypeId==ARTICLE_TYPE.VIMEO) {
                  style += DEFAULT_SCREENSHOT.VIMEO;
                }
                else if (articleTypeId==ARTICLE_TYPE.SOUNDCLOUD) {
                  style += DEFAULT_SCREENSHOT.SOUNDCLOUD;
                }
                else if (articleTypeId==ARTICLE_TYPE.TEXT) {
                  style += DEFAULT_SCREENSHOT.TEXT;
                }

                // We want the thumb version
                style = style.replace('.jpg', '_thumb.jpg');
              }
              else {
                style += self.model.get('extra').src;
              }

              style += ');';
            }

            return style;
          },
          hasComment: function() {
            return this.isComment() || this.isMention();
          },
          isComment: function() {
            return self.model.get('type') === 'comment';
          },
          isFollow: function() {
            return self.model.get('type') === 'follow';
          },
          isLove: function() {
            return self.model.get('type') === 'love';
          },
          isMention: function() {
            return self.model.get('type') === 'mention';
          },
          usernameDisplay: function() {
            var username = self.model.get('username');

            if (username==self.authUserModel.get('username')) {
              username = 'you';
            }

            return username;
          }
        };
      },
      events: {
        'click a': 'onClickLink'
      },
      initialize: function(options) {
        this.authUserModel = options.authUserModel;

        this.on('afterRender', this.onAfterRender, this);

        this.listenTo(this.model, 'remove', this.onRemove);

        if (this.templateHelpers().isFollow()) {
          vent.on('friend:unfollow', this.onUnFollow, this);
        }
      },
      cleanup: function() {
        vent.off(null, null, this);
      },
      onAfterRender: function() {
        var follower;

        if (this.templateHelpers().isFollow()) {
          follower = this.model;
          follower.set('is_private', follower.get('extra').is_private);
          follower.set('is_private_bypass', follower.get('extra').is_private_bypass);
          follower.set('is_auth_user_friend', follower.get('extra').is_auth_user_friend);

          this.setView('.activity-comp.thumbnail', new FollowView({
            model: follower,
            authUserModel: this.authUserModel
          })).render();
        }
      },
      onRemove: function() {
        this.remove();
      },
      onClickLink: function() {
        vent.trigger('activity:close');
      },
      onUnFollow: function(friendModel) {
        var extra = this.model.get('extra');

        // We just unfriended someone. Clear out these props in case they are private.
        // We will need them to confirm the follow again.
        extra.is_private_bypass = 0;
        extra.is_auth_user_friend = 0;
        this.model.set('extra', extra);
      }
    });
  }
);
