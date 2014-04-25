/*jslint browser:true, devel:true*/
/*global define, brackets, $ */

define(function (require, exports, module) {
    'use strict';
    
    var AppInit          = brackets.getModule('utils/AppInit'),
        ExtensionUtils   = brackets.getModule('utils/ExtensionUtils'),
        DocumentManager  = brackets.getModule('document/DocumentManager'),
        CodeInspection   = brackets.getModule('language/CodeInspection'),
        EditorManager    = brackets.getModule('editor/EditorManager'),
        _                = brackets.getModule('thirdparty/lodash');
    
    
    var errorToolTipHTML  = require('text!errortoolip.html'),
        $errorToolTipContainer,    // error tooltip container
        $errorToolTipContent;      // errot tooltip content holder
    
    var TOOLTIP_BOUNDS_OFFSET          = 8;    // offset between tooltip and position of the cursor / or bounds of the editor

    /**
     * and error maps containing information about the last linting session
     */
    var errorsMap;
    
    
    // Text Marks management ------------------------------------------------
    
    /**
     * List of CodeMirror Text markers currently displayed by the editor
     */
    var _markers;
    
    /**
     * remove all markers
     */
    function removeAllMarks() {
        if (_markers) {
            _markers.forEach(function (marker) {
                marker.clear();
            });
        } 
    }
    
    /**
     * For all errors described in errorsMap mark corresponding part of the code
     */
    function markErrors() {
        if (!errorsMap) {
            return;
        }
        
        var editor = _currentDoc._masterEditor;
        
        _markers = _.flatten(Object.keys(errorsMap).map(function (line) {
            return errorsMap[line].map(function (lineError) {
                // if every errors at that position are warning we display a warning
                // else we display an error
                var type = lineError.errors.reduce(function (type, error) {
                    if (error.type === CodeInspection.Type.ERROR) {
                        return CodeInspection.Type.ERROR;
                    }
                    return type;
                }, CodeInspection.Type.WARNING);
                
                var className = type === CodeInspection.Type.WARNING ? 
                    'linter-warning' : 
                    'linter-error'
                ;
                
                return editor._codeMirror.markText(lineError.pos, lineError.endpos, {  
                    className: className  
                });
            });
        }));
    }
    
    // Tooltip widget management ----------------------------------------------
    
    /**
     * hide the error tooltip
     */
    function hideErrorToolTip() {
        $errorToolTipContainer.hide();
        $errorToolTipContent.html('');
    }
    
    /**
     * helpers function that determines if an element contains 
     * the given mouse events
     */
    function divContainsMouse($div, event) {
        var offset = $div.offset();
        
        return (event.clientX >= offset.left &&
                event.clientX <= offset.left + $div.width() &&
                event.clientY >= offset.top &&
                event.clientY <= offset.top + $div.height());
    }
    
    /**
     * if the errorsMap contains errors for the given position returns that error
     * else returns null
     */
    function getLineErrorForPos(pos) {
        var lineErrors;
        if (errorsMap && (lineErrors = errorsMap[pos.line])) {
            for (var i =0, l = lineErrors.length; i < l; i++) {
                var error = lineErrors[i];
                if (pos.ch >= error.pos.ch && pos.ch <= error.endpos.ch) {
                    return error;
                }
            }
        }
        return null;
    }
    
    /**
     * position the tooltip below the marked error, centered
     * but always in the bound of the editor
     */
    function positionToolTip(xpos, ypos, ybot) {
        var toolTipWidth  = $errorToolTipContainer.width(),
            toolTipHeight = $errorToolTipContainer.height(),
            top           = ybot + TOOLTIP_BOUNDS_OFFSET,
            left          = xpos - (toolTipWidth / 2 ),
            $editorHolder = $('#editor-holder'),
            editorOffset = $editorHolder.offset();
        

        left = Math.max(left, editorOffset.left + TOOLTIP_BOUNDS_OFFSET);
        left = Math.min(left, editorOffset.left + $editorHolder.width() - toolTipWidth - TOOLTIP_BOUNDS_OFFSET - 10); 
        
        if (top < (editorOffset.top + $editorHolder.height() - toolTipHeight - TOOLTIP_BOUNDS_OFFSET)) {
            $errorToolTipContainer.removeClass('preview-bubble-above');
            $errorToolTipContainer.addClass('preview-bubble-below');
            $errorToolTipContainer.offset({
                left: left,
                top: top
            });
        } else {
            $errorToolTipContainer.removeClass('preview-bubble-below');
            $errorToolTipContainer.addClass('preview-bubble-above');
            top = ypos - TOOLTIP_BOUNDS_OFFSET - toolTipHeight;
            $errorToolTipContainer.offset({
                left: left,
                top: top
            });
        }
    }
    
    
    /**
     * last position handled 
     */
    var lastPos;
    function handleMouseMove() {
        if (event.which) {
            // Button is down - don't show popovers while dragging
            hideErrorToolTip();
            return;
        }
        
        var editor = EditorManager.getCurrentFullEditor();
        
        if (!editor || !divContainsMouse($(editor.getRootElement()), event)) {
            hideErrorToolTip();
            return;
        }
        // Find char mouse is over
        var cm = editor._codeMirror,
            pos = cm.coordsChar({left: event.clientX, top: event.clientY}),
            showImmediately = false;

        // Bail if mouse is on same char as last event
        if (lastPos && lastPos.line === pos.line && lastPos.ch === pos.ch) {
            return;
        }
        lastPos = pos;

        // No preview if mouse is past last char on line
        if (pos.ch >= editor.document.getLine(pos.line).length) {
            hideErrorToolTip();
            return;
        }
        
        var lineError = getLineErrorForPos(pos);
        if (lineError) {
            $errorToolTipContent.html(lineError.errors.map(function (error) {
                return error.message;    
            }).join('<br/>'));
            var coord = cm.charCoords(pos);
            $errorToolTipContainer.show();
            positionToolTip(coord.left, coord.top, coord.bottom);
        }
    }
    
    
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
        
        var editor;
        if (_currentDoc) {
            $(_currentDoc).off('change', documentChangeHandler);
        }
        
        _currentDoc = document;
        changeOccured = true;
        
        if (_currentDoc) {
            $(_currentDoc).on('change', documentChangeHandler);
        }
    }
    
    /**
     * handle change inside of the document
     */
    function documentChangeHandler() {
        hideErrorToolTip();
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
     * Promise of the returned by the last call to inspectFile or null if linting is disabled. Used to prevent any stale promises
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
        
        removeAllMarks();
        changeOccured = false;

        (_currentPromise = CodeInspection.inspectFile(_currentDoc.file)).then(function (results) {
            // if the promise has changed or if change occured while inspectFile was running
            // we delegate the works to the next session
            if (this !== _currentPromise || !results || changeOccured) {
                return;
            }

            //build the error map
            errorsMap = results.reduce(function (errorsMap, item) { 
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
                            if (isInferiorOrEqual(pos,lineErr) && isInferiorOrEqual(lineErr.pos, endpos)) {
                                lineErr.errors.push({
                                    message: message,
                                    type: type
                                });
                                if (isInferiorOrEqual(lineErr.pos, pos)) {
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

            markErrors();
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
        
        var editorHolder = $('#editor-holder')[0];
        // Note: listening to 'scroll' also catches text edits, which bubble a scroll event up from the hidden text area. This means
        // we auto-hide on text edit, which is probably actually a good thing.
        editorHolder.addEventListener('mousemove', handleMouseMove, true);
        editorHolder.addEventListener('scroll', hideErrorToolTip, true);
        editorHolder.addEventListener('mouseout', hideErrorToolTip, true);
        
        
        $errorToolTipContainer = $(errorToolTipHTML).appendTo($('body'));
        $errorToolTipContent = $errorToolTipContainer.find('.error-tooltip-content');
        
        scheduleRun();
    });
    
    
});