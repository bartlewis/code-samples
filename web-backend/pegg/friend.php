<?php

// Add a friend to the logged in user's list
$slim->post(
  '/friend/:friend_id',
  $authorize($authUser),
  function($friendId) use($pdo, $authUser) {

    $friend = new stdClass();

    // Get user info for the friend being added
    $sth = $pdo->prepare('
      SELECT
        u.user_id, u.avatar, u.username, u.email, u.is_notify_follow,
        u.is_private, u.is_push
      FROM user AS u
      WHERE u.user_id = :friend_id
      LIMIT 1
    ');
    $sth->bindValue(':friend_id', $friendId, PDO::PARAM_INT);
    if ($sth->execute()) {
      $friend = $sth->fetchObject();

      // Add this user to the authUser's friends list.
      $sth = $pdo->prepare('
        INSERT INTO friend (user_id, friend_id, is_accepted, date_added, date_visited)
        VALUES (:user_id, :friend_id, :is_accepted, :date_added, :date_visited)
      ');
      $sth->bindValue(':user_id', $authUser->user_id, PDO::PARAM_INT);
      $sth->bindValue(':friend_id', $friendId, PDO::PARAM_INT);
      $sth->bindValue(':is_accepted', (int)!$friend->is_private, PDO::PARAM_INT);
      $sth->bindValue(':date_added', date('Y-m-d H:i:s'), PDO::PARAM_STR);
      $sth->bindValue(':date_visited', date('Y-m-d H:i:s'), PDO::PARAM_STR);
      if ($sth->execute()) {

        // Send a push/email notification?
        if ($friend->is_private) {
          notify('request', $friend->is_notify_follow, $friend, $authUser);
        }
        else {
          notify('follow', $friend->is_notify_follow, $friend, $authUser);
        }

        // No need to pass these back to client
        unset($friend->user_id, $friend->email, $friend->is_notify_follow);

        // Add the id and is_private_bypass into the object for the client response
        $friend->friend_id = $friendId;
        $friend->is_private_bypass = (int)!$friend->is_private;

        response($friend);
      }
      else{
        response(I18n::_(I18n::FRIEND_NOT_ADDED), 400);
      }
    }
    else{
      response(I18n::_(I18n::FRIEND_NOT_ADDED), 400);
    }
  }
);

// Update the date_visited for a single friend of the logged in user
$slim->put(
  '/friend/:friend_id',
  $authorize($authUser),
  function($friendId) use($slim, $pdo, $authUser) {

    $friend = json_decode($slim->request()->getBody());

    // Set date_visited to NOW, in MySQL datetime format
    $friend->date_visited = date('Y-m-d H:i:s');

    $sth = $pdo->prepare('
      UPDATE friend SET date_visited = :date_visited
      WHERE user_id = :user_id AND friend_id = :friend_id
    ');
    $sth->bindValue(':user_id', $authUser->user_id, PDO::PARAM_INT);
    $sth->bindValue(':friend_id', $friendId, PDO::PARAM_INT);
    $sth->bindValue(':date_visited', $friend->date_visited, PDO::PARAM_STR);
    if ($sth->execute()){
      response($friend);
    }
    else{
      response(I18n::_(I18n::FRIEND_NOT_UPDATED), 400);
    }
  }
);

// Remove a friend from the logged in user's list
$slim->delete(
  '/friend/:friend_id',
  $authorize($authUser),
  function($friendId) use($pdo, $authUser) {

    $sth = $pdo->prepare('
      DELETE FROM friend WHERE user_id = :user_id AND friend_id = :friend_id
    ');
    $sth->bindValue(':user_id', $authUser->user_id, PDO::PARAM_INT);
    $sth->bindValue(':friend_id', $friendId, PDO::PARAM_INT);
    if ($sth->execute()){
      response(array('friend_id' => $friendId));
    }
    else{
      response(I18n::_(I18n::FRIEND_NOT_REMOVED), 400);
    }
  }
);

?>