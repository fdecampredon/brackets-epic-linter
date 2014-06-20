/*jslint browser:true, devel:true, unused: true*/
/*global define, brackets, $ */

define(function (require, exports, module) {
    'use strict';
    
    var AppInit          = brackets.getModule('utils/AppInit'),
        ExtensionUtils   = brackets.getModule('utils/ExtensionUtils'),
        DocumentManager  = brackets.getModule('document/DocumentManager'),
        CodeInspection   = brackets.getModule('language/CodeInspection');
    
    
    var errorsMarks = require('./errorsMarks'),
        errorToolTip = require('./errorToolTip'),
        errorsTick  = require('./errorsTick');
    
    // Linter management ------------------------------------------------------
    
    /**
     * indicate if a document has changed or if something has changed inside a document 
     * between 2 linting session
     */
    var changeOccured = true;
    
    /**
     * the current document in the editor
     */
    var _currentDoc;
    
    /**
     * manage change event listener on the document
     */
    function setCurrentDocument(document) {
        if (_currentDoc === document) {
            return;
        }
        
        if (_currentDoc) {
            $(_currentDoc).off('change', documentChangeHandler);
            errorsTick.setVisible(_currentDoc._masterEditor, false);
        }
        
        _currentDoc = document;
        changeOccured = true;
        
        if (_currentDoc) {
            $(_currentDoc).on('change', documentChangeHandler);
            errorsTick.setVisible(_currentDoc._masterEditor, true);
        }
    }
    
    /**
     * handle change inside of the document
     */
    function documentChangeHandler() {
        changeOccured = true;
        scheduleRun();
    }
    
    /**
     * compare to codemirror position
     */
    function isInferiorOrEqual(pos1, pos2) {
        // null equals null
        if (!pos1 && !pos2) {
            return true;
        }
        // not null superior to null
        if (pos1 && !pos2) {
            return false;
        }
        
        //  null inferior to null
        if (!pos1 && pos2) {
            return true;
        }
        
        //first compare line
        if (pos1.line < pos2.line) {
            return true;
        } else if (pos1.line > pos2.line) {
            return false;
        //compare ch
        } else if (pos1.ch > pos2.ch) {
            return false;
        } else {
            return true;
        }
    }
    
    /**
     * Promise of the returned by the last call to inspectFile or null if linting is disabled. 
     * Used to prevent any stale promises
     * to cause updates of the UI.
     *
     * @private
     * @type {$.Promise}
     */
    var _currentPromise;
       
    /**
     * Run the inspector
     */
    function run() {
        setCurrentDocument(DocumentManager.getCurrentDocument());
        
        // if there is no document open, or if no change has occured since the last 
        // session we does not need to rerun the inspection
        if (!_currentDoc || !changeOccured) {
            return;
        }
        
        errorsMarks.removeAllMarks();
        errorsTick.clear();
        changeOccured = false;

        (_currentPromise = CodeInspection.inspectFile(_currentDoc.file)).then(function (results) {
            // if the promise has changed or if change occured while inspectFile was running
            // we delegate the works to the next session
            if (this !== _currentPromise || !results || changeOccured) {
                return;
            }

            //build the error map
            var errorsMap = results.reduce(function (errorsMap, item) { 
                if (item.result && item.result.errors) {
                    errorsMap = item.result.errors.reduce( function (errorsMap, error) {
                        var pos = error.pos,
                            endpos = error.endpos,
                            message = error.message,
                            type = error.type;
                        
                        //invalid error
                        if (!pos || pos.line < 0) {
                            return errorsMap;
                        }
                        
                        if (!endpos) {
                            // we try to create an endpos for the mark 
                            // firstly by retrieving the token next to the error position
                            var cm = _currentDoc._masterEditor._codeMirror,
                                token = cm. getTokenAt({
                                    line: pos.line,
                                    ch: pos.ch + 1
                                }),
                                index = token ? token.end : -1;
                            
                            // if no token has been retrieved we just put the end position 
                            // at the end of the line
                            if (index < pos.ch) {
                                var line = _currentDoc.getLine(pos.line);
                                if (typeof line === 'undefined') {
                                    return errorsMap;
                                }
                                index = line.length;
                            }
                            
                            endpos = {
                                line: error.pos.line,
                                ch: index
                            };
                        }
                        
                        // in case the error is at the end of the line (like missing semilicon)
                        // we put the error 1 char before 
                        if (endpos.line === pos.line && endpos.ch === pos.ch && pos.ch > 0) {
                            pos.ch --;
                        }
                        
                        var lineErrors =  errorsMap[pos.line] || (errorsMap[pos.line] = []);
                           
                        //regrou errors that overlap
                        for (var i = 0, l = lineErrors.length; i < l; i++) {
                            var lineErr = lineErrors[i];
                            
                            //if errors overlap merge
                            if (isInferiorOrEqual(pos, lineErr.endpos) && isInferiorOrEqual(lineErr.pos, endpos)) {
                                lineErr.errors.push({
                                    message: message,
                                    type: type
                                });
                                if (isInferiorOrEqual(pos, lineErr.pos)) {
                                    lineErr.pos = pos;
                                }
                                if (isInferiorOrEqual(lineErr.endpos, endpos)) {
                                    lineErr.endpos = endpos;
                                }
                                return errorsMap;
                            }
                        }
                        //else add a new error
                        lineErrors.push({
                            pos: pos,
                            endpos: endpos,
                            errors: [{
                                message: message,
                                type: type
                            }]
                        });
                        
                        return errorsMap;
                    }, errorsMap);
                }
                return errorsMap;
            }, {});
            
            errorsMarks.markErrors(_currentDoc._masterEditor, errorsMap);
            errorToolTip.setErrorsMap(errorsMap);
            errorsTick.setErrorsMap(errorsMap);
        });
    }
    
    /**
     * timer used to delay inspection runs
     */
    var timer;
    
    /**
     * schedule a new run session
     */
    function scheduleRun() {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(run, 500);
    }

    
    // Bootstraping ----------------------------------------------
    
    //load 
    ExtensionUtils.loadStyleSheet(module, 'style/style.css');
    
    AppInit.appReady(function () {
        // we listen to the same events than CodeInspection
        $(DocumentManager)
                .on('currentDocumentChange', function () {
                    run();
                })
                .on('documentSaved documentRefreshed', function (event, document) {
                    if (document === DocumentManager.getCurrentDocument()) {
                        run();
                    }
                });
   
        errorToolTip.init();
        errorsTick.init();
        
        scheduleRun();
    });
    
    
});