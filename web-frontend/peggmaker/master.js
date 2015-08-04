$(function() {
  // Get references to elements and init vars
  var jqxhr,
      windowResizeTimeout,
      $body = $('body'),
      $addArtView = $('#add-art'),
      $searchForm = $('.search-form'),
      $searchResults = $('.search-results'),
      $uploadModal = $('.upload-modal'),
      $alertModal = $('.alert-modal'),
      $submit = $('#submit'),
      $reset = $('#reset'),
      $previewImageInput = $('.pegg-preview input[type=file]'),
      $mask = $('.mask'),
      maskSize = $mask.width(),
      $artwork = $('#artwork'),
      artworkWidth = 0,
      artworkHeight = 0,
      $transformButtons = $('button[data-transform]'),
      $checkboxes = $('.checkbox input'),
      $title = $('#pegg-title'),
      $description = $('#pegg-description'),
      $tags = $('#pegg-tags'),
      $submitterEmail = $('#submitter-email'),
      $submitterUsername = $('#submitter-username'),
      isUiWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(navigator.userAgent);

  // Show the header ONLY if we are not within an iOS App Webview.
  // Yes this is gross. I loathe hiding an element and then only showing it via JS.
  // Also, I am committing a major sin doing this browser detection. But, this
  // will provide the most seamless experience for users visiting directly from
  // web, and users coming from within the app. Forgive me, for I have sinned.
  //
  // @link http://stackoverflow.com/a/10170885/158651
  if (!isUiWebView) {
    $body.children('header').show();
  }

  // When pegg size changes, re-init transforms for the new size.
  $(window).resize(function() {
    clearTimeout(windowResizeTimeout);

    // This timeout helps ensire this code only happens when resize is done.
    windowResizeTimeout = setTimeout(function() {
      var previousMaskSize = maskSize;

      // Save the new maskSize
      maskSize = $mask.width();

      // If the mask size has changed, re-init artwork transforms.
      if (previousMaskSize!=maskSize) {
        transform('rotate', 0, true);
        setArtworkCenter();
        setArtworkScaleToFit();
      }
    }, 250);
  });


  // Prevent browser's native drag.
  $mask[0].addEventListener('dragstart', function (event) {
      event.preventDefault();
  });

  // For fields with a "required" indicator...
  function hideOrShowRequireIndicator() {
    var $this = $(this),
        val = $.trim($this.val()),
        $requiredIndicator = $this.next('.require');

    if (val=='') {
      $requiredIndicator.show();
    }
    else {
      $requiredIndicator.hide();
    }
  }

  // Enable or disable the submit button?
  function setAppropriateSubmitEnabledState() {
    var isEnabled = (
          $artwork.attr('src') &&
          $title.val() &&
          $submitterEmail.val()
        );

    // Are all checkboxes checked. This must be the last check.
    if (isEnabled) {
      $checkboxes.each(function() {
        if (!$(this).is(':checked')) {
          isEnabled = false;
          return false
        }
      });
    }

    $submit.prop('disabled', !isEnabled);
  }

  // Is the given scale valid?
  function isValidScale(scale) {
    return (scale * artworkWidth >= maskSize && scale * artworkHeight >= maskSize);
  }

  // Center the artwork in the pegg
  function setArtworkCenter() {
    // Safety first.
    if (artworkWidth == 0 || artworkHeight == 0) {
      return
    }

    transform('x', -((artworkWidth - maskSize) * 0.5), true);
    transform('y', -((artworkHeight - maskSize) * 0.5), true);
  }

  // Set the artwork to fit within the mask just right.
  function setArtworkScaleToFit(multiplier) {
    if (!multiplier) {
      multiplier = 1;
    }

    // Safety first.
    if (artworkWidth == 0 || artworkHeight == 0) {
      return
    }

    // Adjust scale (up or down) of the artwork so that it fits nicely
    // within the pegg (slightly larger than pegg area, to allow for nudging).
    // The shortest, side of the artwork is used for the calculation, to
    // achieve the best fit.
    if (artworkWidth >= artworkHeight) {
      transform('scale', (maskSize / artworkHeight) * multiplier, true);
    }
    else {
      transform('scale', (maskSize / artworkWidth) * multiplier, true);
    }
  }

  // Apply the transform, and update display.
  function transform(type, value, isForce) {
    if (!isForce) {
      // Do nothing if we don't have an image
      if (!$artwork.is(':visible')) {
        return;
      }
    }

    // Apply the transform.
    $artwork.css(type, value);

    // Keep rotate value within 15 degrees plus or minus.
    if (type=='rotate') {
      // Do we need to ask for rotate, or do we already have it (-= & +=)?
      if ($.type(value) === 'string') {
        value = parseInt($artwork.css(type));
      }

      if (value > 15) {
        $artwork.css(type, 15);
      }
      else if (value < -15) {
        $artwork.css(type, -15);
      }
    }

    // Make sure that the scale isn't too small.
    if (type=='scale') {
      // Do we need to ask for scale, or do we already have it (-= & +=)?
      if ($.type(value) === 'string') {
        value = parseFloat($artwork.css(type));
      }

      if (!isValidScale(value)) {
        setArtworkScaleToFit();
      }
    }
  }

  function showAddArtView(isAlterHistory) {
    var selector = '.master-container';

    if (!isUiWebView) {
      selector += ', header';
    }

    $body.children(selector).hide();
    window.scrollTo(0, 0);
    $addArtView.show();

    if (isAlterHistory) {
      history.pushState({'page': 'add-art'}, 'Add Art', '#add-art');
    }
  }

  function hideAddArtView(isAlterHistory) {
    var selector = '.master-container';

    if (!isUiWebView) {
      selector += ', header';
    }

    $addArtView.hide();
    window.scrollTo(0, 0);
    $body.children(selector).show();

    if (isAlterHistory) {
      history.back();
    }
  }

  function searchForImages(query, startIndex) {
    if (!query) {
      return;
    }

    // Disable search button while search is running.
    $searchForm.find('button').prop('disabled', true);

    // Remove any previous "load more".
    $searchResults.find('.load-more').remove();

    // Add a spinner.
    $searchResults.append('<img src="img/spinner.gif" class="spinner">');

    // Make a Google Image Search Request based on query term.
    var request = gapi.client.search.cse.list({
      'cx': '015017978266955891644:fsjlgzrky8i',
      'searchType': 'image',
      'imgSize': 'large',
      'start': startIndex,
      'q': query
    });

    // When request finishes.
    request.then(function(response) {
      var i, resultsCount = 0;

      // Kill spinner.
      $searchResults.find('.spinner').remove();

      // Re-enable search button.
      $searchForm.find('button').prop('disabled', false);

      // Iterate with results, and populate search results.
      for (i = 0; i < response.result.items.length; i++) {
        $searchResults.append([
          '<a href="' + response.result.items[i].link + '">',
            '<img src="' + response.result.items[i].image.thumbnailLink + '" class="img-thumbnail">',
          '</a>'
        ].join('\n'));
      }

      resultsCount = $searchResults.children().length;

      // Add a "load more".
      $searchResults.append([
        '<button class="load-more" data-query="' + query + '" data-start="' + (resultsCount + 1) + '">',
          'Load More...',
        '</button>'
      ].join('\n'));
    });
  }

  // Listen for popstate
  window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page && event.state.page=='add-art') {
      showAddArtView(false);
    }
    else {
      hideAddArtView(false);
    }
  });

  // Allow the overlay to be close with the escape key.
  $('body').keydown(function(event) {
    if (event.which == 27 && $addArtView.is(':visible')){
      hideAddArtView(true)

      return false;
    }
  });

  // When a new image is set on $artwork, get it all set up.
  $artwork.on('load', function() {
    // Set the artwork natural width and height.
    artworkWidth = $artwork.width();
    artworkHeight = $artwork.height();

    // If we fail to get a width/height with jQuery, try naturalWidth/Height.
    if (artworkWidth == 0) {
      artworkWidth = $artwork[0].naturalWidth;
    }
    if (artworkHeight == 0) {
      artworkHeight = $artwork[0].naturalHeight;
    }

    // Safety first.
    if (artworkWidth == 0 || artworkHeight == 0) {
      $reset.click();

      return;
    }

    setArtworkCenter();

    if (artworkWidth == maskSize && artworkHeight == maskSize) {
      // This is the perfect size. No need to scale it.
    }
    else {
      // Scale to fit, with a little breathing room.
      setArtworkScaleToFit(1.1);
    }

    $artwork.show();
    $previewImageInput.hide();
    $transformButtons.prop('disabled', false);

    setAppropriateSubmitEnabledState();
  });

  // Allow a tap on image button to launch the add image picker
  $('.select-search').click(function() {
    showAddArtView(true);
  });

  // Hook up Google Image Search form.
  $searchForm.submit(function(event) {
    event.preventDefault();

    // Empty out any current results.
    $searchResults.empty();

    searchForImages($searchForm.find('input').val(), 1);
  });

  // Hook up image select buttons.
  $searchResults.on('click', 'a', function(event) {
    event.preventDefault();

    // Hide the old image, and reset rotation.
    $artwork.hide();
    transform('rotate', 0, true);

    // Set selected image on the pin.
    $artwork.attr('src', $(this).attr('href'));

    hideAddArtView(true);
  });

  // Load more results.
  $searchResults.on('click', 'button', function(event) {
    var $this = $(this);

    searchForImages($this.data('query'), $this.data('start'));
  });

  // Hook up Reset button.
  $reset.click(function() {
    // Clear values.
    $title.val('');
    $description.val('');
    $tags.val('');
    $previewImageInput.val('')
    $artwork.attr({'src':'', 'style':''});
    $submitterEmail.val('');
    $submitterUsername.val('');
    $checkboxes.prop('checked', false);
    artworkWidth = 0;
    artworkHeight = 0;
    jqxhr = null;

    // Disable
    $transformButtons.prop('disabled', true);
    setAppropriateSubmitEnabledState();

    // Reset required indicators.
    $('form.main .require').show();

    // Allow user to select another image.
    $previewImageInput.show();
  });

  // Hook up Submit button.
  $submit.click(function() {
    var position = $('#artwork').position(),
        boundingClientRect = $('#artwork')[0].getBoundingClientRect(),
        data = {
          'title': $title.val(),
          'description': $description.val(),
          'keywords': $tags.val(),
          'email': $submitterEmail.val(),
          'username': $submitterUsername.val(),
          'scale': parseFloat($artwork.css('scale')),
          'rotate': parseInt($artwork.css('rotate')),
          'canvas_width': boundingClientRect.width,
          'canvas_height': boundingClientRect.height,
          'crop_x': Math.abs(parseInt(position.left)),
          'crop_y': Math.abs(parseInt(position.top)),
          'src': $artwork.attr('src')
        };

    // If we have a small size preview, adjust data accordingly. On small screen
    // devices, we show the preview at 250 x 250, but the actual pegg is 500 x 500.
    if (maskSize==250) {
      data.scale *= 2;
      data.canvas_width *= 2;
      data.canvas_height *= 2;
      data.crop_x *= 2;
      data.crop_y *= 2;
    }

    // @todo Error check all fields.

    // Show the upload modal.
    $uploadModal.modal('show');

    jqxhr = $.post('submit.php', data).done(function(data) {
      var result;

      // Hide the upload modal.
      $uploadModal.modal('hide');

      if (data) {
        result = $.parseJSON(data);

        if (result.type && result.message) {
          $alertModal.find('.modal-title').text(result.type);
          $alertModal.find('.modal-body').text(result.message);
          $alertModal.modal('show');

          if (result.type=='success') {
            // Clear the form
            $reset.click();
          }
        }
      }
    });

    return false;
  });

  // Hook up File Input button
  $previewImageInput.change(function() {
    if (this.files && this.files[0]) {
      var reader = new FileReader();

      // Hide the old image, and reset rotation.
      $artwork.hide();
      transform('rotate', 0, true);

      // Apply the new image as soon as we have it.
      reader.onload = function (event) {
        $artwork.attr('src', event.target.result);
      }

      reader.readAsDataURL(this.files[0]);
    }
  });

  // Check for enabling/disabling the submit button on change...
  $title.change(setAppropriateSubmitEnabledState);
  $description.change(setAppropriateSubmitEnabledState);
  $submitterEmail.change(setAppropriateSubmitEnabledState);
  $checkboxes.change(setAppropriateSubmitEnabledState);

  // Show or hide the "required" checkmark.
  $title.keyup(hideOrShowRequireIndicator);
  $submitterEmail.keyup(hideOrShowRequireIndicator);

  // Hook up scale and rotate buttons.
  $transformButtons.click(function() {
    var $button = $(this),
        // transform is one of the following: scale; x; y; rotate.
        transformType = $button.data('transform'),
        transformVal = $button.data('val');
        transformDif = $button.data('dif');

    // Are we setting an explicit val? Or are we setting a difference?
    if (typeof transformVal !== 'undefined') {
      transform(transformType, transformVal);
    }
    else if (typeof transformDif !== 'undefined') {
      transform(transformType, '+=' + transformDif);
    }
  });

  // Modal events.
  $alertModal.find('button').click(function() {
    $alertModal.modal('hide');
  });
  $uploadModal.find('button').click(function() {
    $uploadModal.modal('hide');
  });
  $uploadModal.on('hide.bs.modal', function (event) {
    jqxhr.abort(); // cancel the upload
  });

  // Drag, for position, rotate, and scale. Supports touch and mouse.
  (function() {
    var left, top, width, height, padding;

    interact($mask[0])
      .draggable({
        max: Infinity
      })
      .on('dragstart', function (event) {
        var position = $artwork.position(),
            clientRect = $('#artwork')[0].getBoundingClientRect(),
            rotateAbs = Math.abs(parseInt($artwork.css('rotate')));

        left = position.left;
        top = position.top;
        width = clientRect.width;
        height = clientRect.height;

        // This helps edge detection when artwork is rotated. Not perfect.
        if (rotateAbs==0) {
          padding = 0;
        }
        else {
          padding = rotateAbs * parseFloat($artwork.css('scale')) * 5;
        }

        isDragging = true;
      })
      .on('dragmove', function (event) {
        left += event.dx;
        top += event.dy;

        if (left <= padding * -1 && left + width >= maskSize + padding) {
          transform('x', '+=' + event.dx);
        }
        if (top <= padding * -1 && top + height >= maskSize + padding) {
          transform('y', '+=' + event.dy);
        }
      });
  }());

  // Pinch to zoom. Supports touch only.
  (function() {
    var scale;

    interact($mask[0]).gesturable({
      onstart: function (event) {
        scale = parseFloat($artwork.css('scale'));

        isPinching = true;
      },
      onmove: function (event) {
        scale += event.ds;

        // Do not set the scale command if it won't fit.
        if (isValidScale(scale)) {
          transform('scale', scale);
        }
      }
    });
  }());

});