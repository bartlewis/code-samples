<?php

// Tell the API that we are about to upload a video.
// Returns a video_id, the filename to use, and a pre-signed URL.
// This method assumes that the video we are uploading will be a .mov file.
$slim->post(
  '/pending_video',
  $authorize($authUser),
  function() use ($pdo, $authUser, $s3) {

    // Start the data structure that we will return to client.
    $pendingVideo = new stdClass();
    $pendingVideo->pending_video_id = null;
    $pendingVideo->user_id = $authUser->user_id;
    $pendingVideo->date_started = date('Y-m-d H:i:s');
    $pendingVideo->date_uploaded = null;
    $pendingVideo->date_processed = null;
    $pendingVideo->is_error = 0;
    $pendingVideo->filename = generateObfuscatedFilename().'.mov';
    $pendingVideo->signed_url = null;
    $pendingVideo->heywatch_id = null;

    // Generate a pre-signed url for S3.
    try {
      $pendingVideo->signed_url = $s3->getCommand('PutObject', array(
        'Bucket' => AWS_CONTENT_BUCKET,
        'Key' => $pendingVideo->user_id.'/'.$pendingVideo->filename,
        'ContentType' => 'video/quicktime',
        'Body'        => '',
        'ContentMD5'  => false
      ))->createPresignedUrl('+15 minutes');
    }
    catch (S3Exception $e) {
      response(I18n::_(I18n::VIDEO_S3_SIGNED_URL_FAILED), 400);
    }

    // Add a record for this video, and get it's ID.
    $sql = '
      INSERT INTO pending_video
        (user_id, date_started, filename)
      VALUES
        (:user_id, :date_started, :filename)
    ';
    $sth = $pdo->prepare($sql);
    $sth->bindValue(':user_id', $pendingVideo->user_id, PDO::PARAM_INT);
    $sth->bindValue(':date_started', $pendingVideo->date_started, PDO::PARAM_STR);
    $sth->bindValue(':filename', $pendingVideo->filename, PDO::PARAM_STR);
    if ($sth->execute()) {
      // Get the new ID
      $pendingVideo->pending_video_id = $pdo->lastInsertId();
    }
    else {
      response(I18n::_(I18n::VIDEO_DB_INSERT_FAILED), 400);
    }

    response($pendingVideo);
  }
);

// Tell the API that we are done uploading the video to S3.
// Execute the encoding request on HeyWatchEncoding.
$slim->put(
  '/pending_video/:pending_video_id',
  $authorize($authUser),
  function($pendingVideoId) use ($pdo, $authUser) {

    $pendingVideo = null;

    // Update the record to indicated upload is finished.
    $sql = '
      UPDATE pending_video
      SET date_uploaded = :date_uploaded
      WHERE
        pending_video_id = :pending_video_id AND date_uploaded IS NULL
      LIMIT 1
    ';
    $sth = $pdo->prepare($sql);
    $sth->bindValue(':date_uploaded', date('Y-m-d H:i:s'), PDO::PARAM_STR);
    $sth->bindValue(':pending_video_id', $pendingVideoId, PDO::PARAM_INT);
    if ($sth->execute() && $sth->rowCount()===1) {
      // SELECT entire row and set to $pendingVideo.
      $sth = $pdo->prepare('
        SELECT * FROM pending_video WHERE pending_video_id = :pending_video_id LIMIT 1
      ');
      $sth->bindValue(':pending_video_id', $pendingVideoId, PDO::PARAM_INT);
      if ($sth->execute()) {
        $pendingVideo = $sth->fetch(PDO::FETCH_OBJ);
      }

      // Get the HeyWatch config file template, and make variable replacements.
      $heyWatchConf = file_get_contents(realpath(dirname(__FILE__)).'/heywatch.conf');
      if ($heyWatchConf) {
        $heyWatchConf = str_replace(
          array(
            '{{awsAccessKey}}',
            '{{awsSecretKey}}',
            '{{s3Bucket}}',
            '{{userId}}',
            '{{filename}}',
            '{{webhookUrl}}'
          ),
          array(
            AWS_ACCESS_KEY_ID,
            AWS_SECRET_KEY,
            AWS_CONTENT_BUCKET,
            $authUser->user_id,
            $pendingVideo->filename,
            API_URL.'/pending_video/completed/'.$pendingVideo->pending_video_id
          ),
          $heyWatchConf
        );
      }
      else {
        response(I18n::_(I18n::VIDEO_CONFIG_MISSING), 400);
      }

      // Execute the HeyWatch job.
      $ch = curl_init();
      curl_setopt($ch, CURLOPT_URL, 'https://heywatch.com/api/v1/job');
      curl_setopt($ch, CURLOPT_USERPWD, HEYWATCH_API_KEY.':');
      curl_setopt($ch, CURLOPT_POST, 1);
      curl_setopt($ch, CURLOPT_POSTFIELDS, $heyWatchConf);
      curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
      curl_setopt($ch, CURLOPT_USERAGENT, 'HeyWatch/2.0.0 (PHP)');
      curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Content-Length: '.strlen($heyWatchConf),
        'Content-Type: text/plain',
        'Accept: application/json')
      );
      $heyWatchJob = json_decode(curl_exec($ch));
      if ($heyWatchJob->status!='ok') {
        response(I18n::_(I18n::VIDEO_ENCODING_ERROR), 400);
      }
    }
    else {
      response(I18n::_(I18n::VIDEO_DB_UPDATE_ERROR), 400);
    }

    response($pendingVideo);
  }
);

// Get the entire object for the pending video.
$slim->get(
  '/pending_video/:pending_video_id',
  $authorize($authUser),
  function($pendingVideoId) use ($pdo, $authUser) {

    $pendingVideo = null;

    $sql = '
      SELECT * FROM pending_video
      WHERE
        pending_video_id = :pending_video_id AND
        user_id = :user_id
      LIMIT 1
    ';
    $sth = $pdo->prepare($sql);
    $sth->bindValue(':pending_video_id', $pendingVideoId, PDO::PARAM_INT);
    $sth->bindValue(':user_id', $authUser->user_id, PDO::PARAM_INT);
    if ($sth->execute()) {
      $pendingVideo = $sth->fetch(PDO::FETCH_OBJ);
    }

    // Did we get a $pendingVideo?
    if (!$pendingVideo) {
      response(I18n::_(I18n::VIDEO_INVALID_ID), 400);
    }

    response($pendingVideo);
  }
);

// The webhook that HeyWatch posts to when encoding is complete.
$slim->post(
  '/pending_video/completed/:pending_video_id',
  function($pendingVideoId) use ($pdo) {

    // Get results passed in from HeyWatch
    $results = json_decode(file_get_contents('php://input'), true);

    if ($results && is_array($results) && array_key_exists('errors', $results)) {
      // Update the record to indicated processing is finished.
      $sql = '
        UPDATE pending_video
        SET
          date_processed = :date_processed, is_error = :is_error,
          heywatch_id = :heywatch_id
        WHERE
          pending_video_id = :pending_video_id AND
          date_uploaded IS NOT NULL AND date_processed IS NULL
        LIMIT 1
      ';
      $sth = $pdo->prepare($sql);
      $sth->bindValue(':date_processed', date('Y-m-d H:i:s'), PDO::PARAM_STR);
      $sth->bindValue(':is_error', count($results['errors']), PDO::PARAM_INT);
      $sth->bindValue(':heywatch_id', $results['id'], PDO::PARAM_INT);
      $sth->bindValue(':pending_video_id', $pendingVideoId, PDO::PARAM_INT);
      $sth->execute();
    }
  }
);

?>