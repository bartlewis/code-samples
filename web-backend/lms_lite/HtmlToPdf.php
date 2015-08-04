<?php
/**
 * HtmlToPdf class.
 *
 * This class was originally created as a wrapper for the wkhtmltopdf command line
 * application. See @link http://code.google.com/p/wkhtmltopdf/ or
 * @link http://github.com/antialize/wkhtmltopdf/ for more.
 *
 * HtmlToPdf allows you to pass in HTML as a string, local file on the server,
 * or as a URL. It takes this input and uses it to generate a PDF and save it in
 * the location you specify.
 *
 * ScriptOptions should be in the form of a JSON Object string within the config
 * XML file. This will be converted into an associative array for the php. When
 * the script is called, that associative array is turned into a string of
 * options for the cmd.exe. The key is the option name (minus the --). For a
 * complete list of options, execute the exe from the command line and pass the
 * --help option.
 *
 * <b>Some Example Usages:</b>
 * <code>
 * $htmlToPdf = $this->getApplication()->getModule('htmlToPdf');
 *
 * //URL to PDF saved on server.
 * $htmlToPdf->setInputFormat(HtmlToPdfInputFormat::Url);
 * $htmlToPdf->setHtml('www.google.com');
 * $htmlToPdf->setPdf('some/directory/google.pdf');
 * $success = $htmlToPdf->save();
 *
 * //Local server HTML file to PDF saved on server.
 * $htmlToPdf->setInputFormat(HtmlToPdfInputFormat::File);
 * $htmlToPdf->setHtml('some/directory/coolio.html');
 * $htmlToPdf->setPdf('some/other/directory/coolio.pdf');
 * $success = $htmlToPdf->save();
 *
 * //HTML string to PDF directly prompted for open/save by browser.
 * $htmlToPdf->setInputFormat(HtmlToPdfInputFormat::String);
 * $htmlToPdf->setHtml('<html><body>Hello World!</body></html>');
 * $htmlToPdf->download();
 * </code>
 *
 * To use this module, you must register it within your application.xml like this:
 * <code>
 *    <module id="htmlToPdf" class="Application.App_Code.Web.HtmlToPdf"
 *      ScratchDirectory="protected/runtime/htmltopdf-scratch/"
 *      Script="vendor/htmltopdf/wkhtmltopdf-0.8.3.exe"
 *      ScriptOptions='{"orientation":"Landscape"}'
 *      InputFormat="String" />
 * </code>
 *
 * Note: Available "ScriptOptions" can be viewed by hitting the exe from the
 * command line, followed by the help option.
 * (Example: CMD> c:\path\to\wkhtmltopdf-0.8.3.exe --help)
 *
 * @author Bart Lewis <bartlewis@gmail.com>
 * @package App_Code.Web
 */
class HtmlToPdf extends TModule {
  private $_script;
  private $_scriptOptions = array();
  private $_scratchDirectory;
  private $_pdf;
  private $_html;
  private $_inputFormat;
  private $_enabled = true;

  /**
   * Initialize the module.
   *
   * Make sure required params are in the application.xml and perform garbage
   * collection.
   *
   * @param TXmlElement
   */
  public function init($config){
    parent::init($config);

    if (!$this->getEnabled()) return;

    if (!$this->getScratchDirectory())
      throw new TConfigurationException('Missing param: ScratchDirectory');

    if (!$this->getScript())
      throw new TConfigurationException('Missing param: Script');

    //Clean out old files in scratch directory 1 out of every 100 times.
    if (rand(1,100)==100){
      $scratchDirectory = $this->getScratchDirectory();
      $scratchFiles = array();
      foreach(glob($scratchDirectory.'*-htmltopdf-scratch.pdf') as $file)
        $scratchFiles[] = $file;
      foreach(glob($scratchDirectory.'*-htmltopdf-scratch.html') as $file)
        $scratchFiles[] = $file;

      //Delete all scratch files created more than an hour ago.
      foreach($scratchFiles as $scratchFile)
        if (filectime($scratchFile)<mktime()-3600) unlink($scratchFile);
    }
  }

  /**
   * Save pdf to server and return success.
   *
   * @return boolean success
   */
  public function save(){
    return $this->exec($this->getFrom(), $this->getTo());
  }

  /**
   * Generate pdf directly to the browser in a prompt (calls php exit!).
   */
  public function download($displayName){
    $from = $this->getFrom();
    $to = $this->getTo();

    if ($this->exec($from, $to)){
      header('Expires: 0');
      header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
      header('Cache-Control: private', false);
      header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
      header('Content-Type: application/pdf');
      header('Content-Transfer-Encoding: binary');
      header('Content-Disposition: attachment; filename="'.$displayName.'.pdf"');
      header('Pragma: public');
      ob_clean();
      flush();
      readfile($to);
      exit;
    }
    else{
      throw new TException('There was an error in '.$this->getScript());
    }
  }

  /**
   * Execute the command line script and save the pdf file to the server.
   *
   * @return boolean success
   */
  private function exec($from, $to){
    $from = escapeshellarg($from);
    $to = escapeshellarg($to);

    exec(
      $this->getScript().$this->getScriptOptions(true).' '.$from.' '.$to,
      $output,
      $returnVar
    );

    return ($returnVar==0);
  }

  /**
   * @return string the "to pdf" section for the command line application
   */
  private function getTo(){
    $to = $this->getPdf();
    if (empty($to)){
      $to = realpath($this->getScratchDirectory()).'/'.uniqid().'-htmltopdf-scratch.pdf';
    }
    else{
      $pathInfo = pathinfo($to);
      if (strtolower($pathInfo['extension'])!='pdf')
        throw new TException('Invalid extension specified for PDF.');

      $to = realpath($pathInfo['dirname']);
      if (!is_dir($to)) throw new TException('Invalid directory for PDF.');
      if (!is_writeable($to)) throw new TException('Unable to write to PDF directory.');

      $to .= '/'.$pathInfo['basename'];
    }

    return $to;
  }

  /**
   * @return string the "from html" section for the command line application
   */
  private function getFrom(){
    $html = $this->getHtml();
    $inputFormat = $this->getInputFormat();

    //Do we have a valid type?
    TPropertyValue::ensureEnum($inputFormat, 'HtmlToPdfInputFormat');

    //Do we have something in $html?
    if (empty($html))
      throw new TException(
        'No HTML file, url, or string specified. Nothing to convert to PDF.'
      );

    //Which type?
    if ($inputFormat==HtmlToPdfInputFormat::Url){
      $from = $html;
    }
    else if ($inputFormat==HtmlToPdfInputFormat::File){
      $from = realpath($html);
      if (!is_file($from)) throw new TException('Invalid HTML file.');
    }
    else if ($inputFormat==HtmlToPdfInputFormat::String){
      //Scratch file.
      $from = $this->getScratchDirectory().uniqid().'-htmltopdf-scratch.html';

      //Write HTML string to a scratch file.
      $handle = fopen($from, 'ab');
      if (!fwrite($handle, $html))
        throw new TException('Unable to create scratch file from HTML string.');
      fclose($handle);

      $from = realpath($from);
      if (!is_file($from)) throw new TException('Invalid HTML scratch file.');
    }

    return $from;
  }

  /**
   * The server file path to the command line application.
   *
   * @param string path to the actual command line application
   */
  public function setScript($value){
    $this->_script = TPropertyValue::ensureString($value);
  }

  /**
   * @see setScript
   * @return string path to the actual command line application
   */
  public function getScript(){
    $value = realpath($this->_script);

    if (is_file($value) && is_executable($value)) return $value;
    else throw new TException('Script must be valid, executable file.');
  }

  /**
   * Command line options to use for the Script. To view available options,
   * execute the Script vi a command line with the "--help" flag.
   *
   * $value can be a JSON string to be converted into an assoc array or an
   * associative array.
   *
   * @param string|array json object string or associative array
   */
  public function setScriptOptions($value){
    if (is_string($value)) $value = json_decode($value, true);
    if (is_array($value))
      $this->_scriptOptions = $value;
    else throw new TException('ScriptOptions must be an array or a JSON object.');
  }

  /**
   * Key is the command name (minus the --) and value is the value.
   *
   * @see setScriptOptions
   * @return array|string associative array of option pairs or a string of all
   *      options ready for exe (command names prepended with --)
   */
  public function getScriptOptions($commandLineFormat=false){
    if (!$commandLineFormat){
      return $this->_scriptOptions;
    }
    else{
      $options = '';
      foreach($this->_scriptOptions as $key=>$value)
        $options .= ' --'.$key.' '.$value;

      return $options;
    }
  }

  /**
   * Sets a single script option.
   *
   * @param string $name
   * @param string $value
   */
  public function setScriptOption($name, $value){
    $this->_scriptOptions[$name] = $value;
  }

  /**
   * Gets a single script option or null if not found.
   *
   * @param string $name
   * @return string|null
   */
  public function getScriptOption($name){
    if (array_key_exists($name, $this->_scriptOptions))
      return $this->_scriptOptions[$name];
    else
      return null;
  }

  /**
   * Deletes a single script option.
   *
   * @param string $name
   */
  public function deleteScriptOption($name){
    if (array_key_exists($name, $this->_scriptOptions))
      unset($this->_scriptOptions[$name]);
  }

  /**
   * This directory path is used as a temporary directory for storing html
   * and pdfs files. Garbage collection is done on these files regularly to
   * make sure they don't take up too much space. This directory must by
   * readable and writeable by the web service.
   *
   * @param string directory path
   */
  public function setScratchDirectory($value){
    $this->_scratchDirectory = TPropertyValue::ensureString($value);
  }

  /**
   * @see getScratchDirectory
   * @return string directory path
   */
  public function getScratchDirectory(){
    if (!is_dir($this->_scratchDirectory)){
      if (!@mkdir($this->_scratchDirectory)){
        throw new TException(
          'Unable to create scratch directory needed by HtmlToPdf.
          Please Ensure ScratchDirectory is a valid, writeable directory.'
        );
      }
    }
    if (!is_writable($this->_scratchDirectory)){
      throw new TException('ScratchDirectory must be a writeable directory.');
    }

    return $this->_scratchDirectory;
  }

  /**
   * Where to save the PDF and what to name the file.
   *
   * @param string local file path to use when saving the pdf
   */
  public function setPdf($value){
    $this->_pdf = TPropertyValue::ensureString($value);
  }

  /**
   * @see setPdf
   * @return string local file path to use when saving the pdf
   */
  public function getPdf(){
    return $this->_pdf;
  }

  /**
   * The input to use when generating the pdf. The type of input used
   * is dictated by the InputFormat.
   *
   * @param string html as string, local file path to html file, or url
   */
  public function setHtml($value){
    $this->_html = TPropertyValue::ensureString($value);
  }

  /**
   * @see setHtml
   * @return string html as string, local file path to html file, or url
   */
  public function getHtml(){
    return $this->_html;
  }

  /**
   * The type of input being used with setHtml.
   *
   * @param string one of the following Enums: File, Url, String
   */
  public function setInputFormat($value){
    $this->_inputFormat = TPropertyValue::ensureEnum($value, 'HtmlToPdfInputFormat');
  }

  /**
   * @see setInputFormat
   * @return string one of the following Enums: File, Url, String
   */
  public function getInputFormat(){
    return $this->_inputFormat;
  }


  /**
   * @param boolean $value
   */
  public function setEnabled($value){
    $this->_enabled = TPropertyValue::ensureBoolean($value);
  }

  /**
   * @return boolean
   */
  public function getEnabled(){
    return $this->_enabled;
  }
}

class HtmlToPdfInputFormat extends TEnumerable {
  const File='File';
  const Url='Url';
  const String='String';
}
?>
