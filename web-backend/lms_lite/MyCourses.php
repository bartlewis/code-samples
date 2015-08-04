<?php
/**
 * MyCourses page class.
 *
 * @author Bart Lewis <bartlewis@gmail.com>
 * @package pages
 */
class MyCourses extends AppPage {
  /**
   * @param TEventParameter
   */
  public function onLoad($param){
    parent::onInit($param);

    // Set Get Adobe Reader panel to false initially on each load.
    $this->AdobeReaderPanel->Visible = false;
  }

  /**
   * This method is invoked when the page enters 'onPreRender' stage.
   *
   * @param TEventParameter event parameter to be passed to the event handlers
   */
  public function onPreRender($param){
    parent::onPreRender($param);

    if (!$this->IsCallBack){
      $this->setPageTitle('My WBT Courses');

      $clientScript = $this->getPage()->getClientScript();
      $scormApiPath = $this->publishAsset('../App_Code/Scorm/API_1484_11.js', __CLASS__);
      $clientScript->registerScriptFile($scormApiPath, $scormApiPath);

      $this->setCourseIdsInSession();

      $this->bindUserCourseRepeater();
    }
  }

  /**
   * Set datasource and perform databinding for UserCourseRepeater control.
   *
   * This method also determines and sets the VirtualItemCount for the
   * repeater and creates a message to the user in the form of
   * "Displaying x - y of z courses".
   *
   * @uses getUserCourseCount
   * @uses getUserCourses
   */
  private function bindUserCourseRepeater(){
    $userCourseCount = $this->UserCourseCount;
    $this->UserCourseRepeater->VirtualItemCount = $userCourseCount;
    $this->UserCourseRepeater->DataSource = $this->UserCourses;
    $this->UserCourseRepeater->dataBind();

    if ($userCourseCount==0){
      $msg = '';
    }
    else{
      $offset = (
        $this->UserCourseRepeater->CurrentPageIndex * $this->UserCourseRepeater->PageSize
      );
      $thruNum = ($offset + $this->UserCourseRepeater->PageSize);
      if ($thruNum > $userCourseCount) $thruNum = $userCourseCount;

      $msg = sprintf('Displaying %d - %d of %d courses',
        ($offset + 1),
        $thruNum,
        $userCourseCount
      );
    }
    $this->UserCourseRepeaterMetaLabel->Text = $msg;
  }

  /**
   * Fire when each item is databound within UserCourseRepeater control.
   *
   * This method bind the CourseScoRepeater control within each
   * UserCourseRepeater item template.
   *
   * @param TRepeater
   * @param TEventParameter
   * @uses getAppUrl
   * @uses getContentPath
   */
  public function UserCourseRepeater_OnItemDataBound($sender, $param){
    global $CMI_SUCCESS_STATUS, $CMI_COMPLETION_STATUS;

    $item = $param->Item;

    if ($item->ItemType==='Item' || $item->ItemType==='AlternatingItem'){
      //First, render a button at all? Second, show or hide it?
      $certificateButton = $item->CertificateThemeIconButton;
      if ($this->getIsCertificate($item->Data->course->course_series_id)){
        $certificateButton->Visible = true;

        if ($this->getIsShowCertificateButton($item->Data))
          $certificateButton->Style->reset();
        else
          $certificateButton->Style->DisplayStyle = TDisplayStyle::None;
      }
      else{
        $certificateButton->Visible = false;
      }

      // Show get adober reader button?
      if ($certificateButton->Visible) $this->AdobeReaderPanel->Visible = true;

      $urlBase = $this->AppUrl.$this->ContentPath.'course-'.$item->Data->course_id.'/';

      $dataSource = array();
      $courseScos = $this->getCourseScosByCourseId($item->Data->course_id);
      foreach ($courseScos as $courseSco){
        $url = $courseSco->sco->resource_href;
        if ($courseSco->sco->parameters!=null)
          $url .= htmlspecialchars(
            $courseSco->sco->parameters,
            ENT_QUOTES,
            $this->Application->Parameters['charset']
          );

        //Params converted to html safe json for storage in hidden input element.
        $params = str_replace(
          '"',
          '',
          json_encode(
            array(
              'userCmiId' => $courseSco->user_cmis[0]->user_cmi_id,
              'width' => $courseSco->sco->width,
              'height' => $courseSco->sco->height,
            )
          )
        );

        if ($courseSco->sco->cmi_scaled_passing_score==0)
          $userScore = '&nbsp;';
        else
          $userScore = ($courseSco->user_cmis[0]->score_scaled*100).'&#37;';

        $dataSource[] = array(
          'url' => $urlBase.$url,
          'params' => $params,
          'title' => $courseSco->sco->title,
          'score' => $userScore,
          'success' => array_search(
            $courseSco->user_cmis[0]->cmi_success_status_id,
            $CMI_SUCCESS_STATUS
          ),
          'completion' => array_search(
            $courseSco->user_cmis[0]->cmi_completion_status_id,
            $CMI_COMPLETION_STATUS
          ),
          'is_required' => $courseSco->is_required
        );
      }

      $item->CourseScoRepeater->DataSource = $dataSource;
      $item->CourseScoRepeater->dataBind();
    }
  }

  /**
   * Fired when a users requests to change the page of the UserCourseRepeater
   * control, this method sets the new current page within the repeater
   * and sets {@link setUserCourses} and {@link setCourseScos} to null, which
   * in turn tells {@link getUserCourses} and {@link getCourseScos} to use the
   * database instead of the cache to retrieve the next page of data.
   *
   * @param TPager
   * @param TEventParameter
   * @uses setUserCourses
   * @uses setCourseSeries
   * @uses setCourseScos
   */
  public function UserCourseRepeater_OnPageIndexChanged($sender, $param){
    $this->UserCourseRepeater->CurrentPageIndex = $param->NewPageIndex;
        $this->UserCourses = null;
    $this->CourseSeries = null;
        $this->CourseScos = null;
  }

  /**
   * Prompt the user to download the certificate.
   *
   * @param TThemeIconButton
   * @param TEventParameter
   */
  public function CertificateThemeIconButton_OnCommand($sender, $param){
    $index = $sender->Parent->Parent->ItemIndex;
    $userCourses = $this->getUserCourses();

    //Make sure this is a valid course score for certificate printing.
    if ($this->getIsShowCertificateButton($userCourses[$index])){
      $this->getAppCertificate()->download(
        $this->getUser()->getUserId(), $param->CommandParameter
      );
    }
    else{
      $this->setErrorMessage('Invalid Course status for this certificate.');
    }
  }

  /**
   * Called via Ajax after a lesson performs a SCORM commit.
   *
   * @param AppCallback
   * @param TEventParameter
   */
  public function ScormOnAfterCommitCallback_OnCallback($sender, $param){
    global $CMI_SUCCESS_STATUS, $CMI_COMPLETION_STATUS;

    //Which row are we coming from?
    $itemIndex = $param->CallbackParameter->itemIndex;
    $item = $this->UserCourseRepeater->Items[$itemIndex];

    //Get a FRESH UserCourseRecord for this user/course.
    $userCourse = $this->UserCourses[$itemIndex];
    $oldCmiSuccessStatusId = $userCourse->cmi_success_status_id;
    $oldCmiCompletionStatusId = $userCourse->cmi_completion_status_id;
    $userCourse = UserCourseRecord::finder()->findByPk($userCourse->user_course_id);

    //Has the status JUST changed to passed or completed?
    if (
      ($oldCmiSuccessStatusId!=$userCourse->cmi_success_status_id
        && $userCourse->cmi_success_status_id==$CMI_SUCCESS_STATUS['passed'])
      ||
      ($oldCmiCompletionStatusId!=$userCourse->cmi_completion_status_id
        && $userCourse->cmi_completion_status_id==$CMI_COMPLETION_STATUS['completed'])
    ){
      //Reload UserCourses ViewState.
      $this->setUserCourses(null);
      $this->getUserCourses();

      //Show the certificate icon/button?
      if ($this->getIsShowCertificateButton($userCourse)){
        //Show Certificate button for this course.
        $item->CertificateThemeIconButton->Style->reset();
        $item->CertificateActivePanel->render($param->NewWriter);

        //Rebind the click observers to description links as they get wipped
        //out by the ActivePanel.
        $this->getClientScript()->registerEndScript(
          'rebindDescriptionLink',
          'App.Page.observeDescriptionLinks("#my-courses-table tr:nth-child('.($itemIndex+2).') a[href*=#toggleDescription]")'
        );
      }

      //Prompt for a survey?
      $surveyUrl = $userCourse->course->course_series->survey_url;
      if ($surveyUrl){
        $this->setNoticeMessage(
          str_replace(
            array('{course}', '{url}'),
            array($userCourse->course->title, $surveyUrl),
            $this->Application->Parameters['surveyMessage']
          ),
          true
        );

        //Scroll to message (in case it is out of view)
        $this->getClientScript()->registerEndScript(
          'scrollToTop',
          'new Effect.ScrollTo("lms-header")'
        );
      }
    }
  }

  /**
   * Get an array of {@link CourseScoRecord} objects for a given course.
   *
   * @param int course id
   * @return array of CourseScoRecord objects
   * @uses getCourseScos
   */
  public function getCourseScosByCourseId($courseId){
    $items = array();

    $courseScos = $this->CourseScos;
    foreach ($courseScos as $courseSco)
      if ($courseSco->course_id==$courseId)
        $items[] = $courseSco;

    return $items;
  }

  /**
   * Get an array of {@link CourseScoRecord} objects from the database
   * or the ViewState cache.
   *
   * This method gets sco data and user sco data for all scos that are
   * under the courses returned by {@link getUserCourses}.
   *
   * @return array array of CourseScoRecord objects
   * @uses getUserCourses
   * @uses setCourseScos
   */
  public function getCourseScos(){
    $courseScos = $this->getViewState('CourseScos');
    if (is_null($courseScos)){
      $courseIds = array();
      $userCourses = $this->UserCourses;
      foreach ($userCourses as $userCourse)
        $courseIds[] = $userCourse->course_id;

      $arc = new TActiveRecordCriteria();
      $arc->Condition = 'course_id in ('.implode(',', $courseIds).')';
      $arc->OrdersBy = 'sort';
      $courseScos = CourseScoRecord::finder()->with_sco()->with_user_cmis(
        'user_id = ?', $this->User->UserId
      )->findAll($arc);

      $this->CourseScos = $courseScos;
    }
    return $courseScos;
  }

  /**
   * Set an array of {@link CourseScoRecord} objects in the ViewState cache.
   *
   * @param array of CourseScoRecord objects
   */
  public function setCourseScos($courseScos){
    $this->setViewState('CourseScos', $courseScos);
  }

  /**
   * Get an array of {@link UserCourseRecord} objects from the database
   * or the ViewState cache. When getting records from the database, we
   * only get enough records for one "page".
   *
   * @return array array of UserCourseRecord objects
   * @uses setUserCourses
   */
  public function getUserCourses(){
    $userCourses = $this->getViewState('UserCourses');
    if (is_null($userCourses)){
      $userCourses = UserCourseRecord::finder()->with_course()->findAllAvailable(
        $this->User->UserId,
        true,
        null,
        $this->UserCourseRepeater->PageSize,
        $this->UserCourseRepeater->CurrentPageIndex * $this->UserCourseRepeater->PageSize
      );

      $this->UserCourses = $userCourses;
    }
    return $userCourses;
  }

  /**
   * Set an array of {@link UserCourseRecord} objects in the ViewState cache.
   *
   * @param array of UserCourseRecord objects
   */
  public function setUserCourses($userCourses){
    $this->setViewState('UserCourses', $userCourses);
  }

  /**
   * How many courses in total are in my profile?
   *
   * @return int the number of courses
   */
  public function getUserCourseCount(){
    $userCourseCount = $this->getViewState('UserCourseCount');
    if (is_null($userCourseCount)){
      $userCourseCount = UserCourseRecord::finder()->countAvailable(
        $this->User->UserId,
        true
      );

      $this->setViewState('UserCourseCount', $userCourseCount);
    }
    return $userCourseCount;
  }

  /**
   * @return array of CourseSeriesRecord objects
   */
  public function getCourseSeries(){
    $courseSeries = $this->getViewState('CourseSeries');
    if (is_null($courseSeries)){
      $courseSerieIds = array();
      $userCourses = $this->getUserCourses();
      foreach ($userCourses as $userCourse)
        $courseSerieIds[] = $userCourse->course->course_series_id;

      $courseSeries = CourseSeriesRecord::finder()->findAll(
        'course_series_id in ('.implode(',', $courseSerieIds).')'
      );

      $this->setCourseSeries($courseSeries);
    }
    return $courseSeries;
  }

  /**
   * @param array of CourseSeriesRecord objects
   */
  public function setCourseSeries($courseSeries){
    $this->setViewState('CourseSeries', $courseSeries);
  }

  /**
   * Get a CourseSeriesRecord that matches the given id.
   *
   * @param int $courseSeriesId
   * @return CourseSeriesRecord
   */
  public function getCourseSeriesById($courseSeriesId){
    $courseSeries = $this->getCourseSeries();
    foreach ($courseSeries as $series)
      if ($series->course_series_id==$courseSeriesId) return $series;

    return null;
  }

  /**
   * Should we render a certificate button for the given course_series_id?
   *
   * @param int
   * @return bool
   */
  private function getIsCertificate($courseSeriesId){
    if (!$this->getAppCertificate()->getIsAvailable()) return false;

    $courseSeries = $this->getCourseSeriesById($courseSeriesId);
    return !empty($courseSeries->certificate_id);
  }

  /**
   * Should we render a certificate button for the given UserCourseRecord?
   *
   * @param UserCourseRecord $userCourse
   * @return bool
   */
  private function getIsShowCertificateButton($userCourse){
    global $CMI_SUCCESS_STATUS, $CMI_COMPLETION_STATUS;

    return ($this->getIsCertificate($userCourse->course->course_series_id)
       && ($userCourse->cmi_success_status_id==$CMI_SUCCESS_STATUS['passed']
       || $userCourse->cmi_completion_status_id==$CMI_COMPLETION_STATUS['completed']));
  }

  /**
   * Sets an array of CourseIds in $_SESSION
   *
   * Only the course ids for courses on this page of data are stored in this
   * array. This array is used by the authorize.php script in "content/" to
   * control what content can be accessed.
   */
  private function setCourseIdsInSession(){
    $courseIds = array();
    $userCourses = $this->getUserCourses();

    foreach($userCourses as $userCourse)
      $courseIds[] = $userCourse->course_id;

    $_SESSION['Authorize:CourseIds'] = $courseIds;
  }
}
?>