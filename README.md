code-samples
=======

Snippets of code from current and past projects. These code snippets are broken down into front-end, back-end, and iOS. None of these files represents an entire project. They are small parts of larger projects, to give you an idea of my coding style. In all of these files, I wrote 95% or more of the code within.

The top level of directories defines the type, while the second level defines the name of the project where that code is from.

 - apps-ios
	 - pegg
 - web-backend
	 - lms_lite
	 - pegg
 - web-frontend
	 - peggmaker
	 - peggsite
	 - peggmaker

## Project Code Samples ##

### apps-ios/pegg ###
The [Pegg app](https://itunes.apple.com/us/app/peggsite/id989587847?ls=1&mt=8) is a social media app, for iPhone. These samples include a few ViewControllers that I built for different pages within the app.

 - Objectice-C

### web-backend/lms_lite ###
LMS Lite is an application that allowed our State & Local Government customers to host their web-based training. These samples include a PHP/Prado based wrapper that I created around a command line utility, and a class that represents a page/view within the application.

 - PHP/MySQL
 - [Prado Framework](http://www.pradosoft.com/)

### web-backend/pegg ###
The back-end of the aforementioned Pegg app. These samples include a few API endpoints around "friend" management, and uploading/processing of native video.

 - PHP/MySQL
 - [Slim Framework](http://www.slimframework.com/)

### web-frontend/peggmaker ###
The Javascript of the [peggmaker page](http://peggmaker.pegg.co/). This sample is the bulk of the JavaScript for the page, which allows the user to upload, resize, and rotate images (among other things).

 - JavaScript/jQuery

### web-frontend/peggsite ###
Before Pegg was an iPhone app, it was a web application. The examples here include several components that comprise an activity list, which held things like: "joe loved your post"; "jane followed you", "drake commented on your post".

 - JavaScript/jQuery
 - Backbone.js
 - Require.js
 - Handlebars.js

### web-frontend/xp23 ###
XP-23 was the internal code name for a development tool that we used to produce web-based training (WBT). These samples are part of the output of that WBT. Each page in this WBT was based on a template, and the JavaScript logic keyed in on that template type, and provided different functionality for each.

 - JavaScript/jQuery
 - HTML5
