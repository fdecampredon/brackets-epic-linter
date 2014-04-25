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
    
    
    var errorToolTipHTML  = require("text!errortoolip.html"),
        $errorToolTipContainer,    // function hint container
        $errorToolTipContent;      // function hint content holder
    
    var TOOLTIP_BOUNDS_OFFSET          = 8;    // offset between tooltip and position of the cursor / or bounds of the editor

    
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
     * for a set of errors mark corresponding portion of text in the editor
     */
    function markErrors() {
        if (!errorsMap) {
            return;
        }
        
        var editor = _currentDoc._masterEditor;
        
        _markers = _.flatten(Object.keys(errorsMap).map(function (line) {
            return errorsMap[line].map(function (lineError) {
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
                
                return editor._codeMirror.markText(lineError.pos, lineError.endpos, {  className: className  });
            });
        }));
    }
    
    // Tooltip widget management ----------------------------------------------
    
    
    function hideErrorToolTip() {
        $errorToolTipContainer.hide();
        $errorToolTipContent.html('');
    }
    
    function divContainsMouse($div, event) {
        var offset = $div.offset();
        
        return (event.clientX >= offset.left &&
                event.clientX <= offset.left + $div.width() &&
                event.clientY >= offset.top &&
                event.clientY <= offset.top + $div.height());
    }
    
    function getErrorForPos(pos) {
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
    
    function positionToolTip(xpos, ypos, ybot) {
        var toolTipWidth  = $errorToolTipContainer.width(),
            toolTipHeight = $errorToolTipContainer.height(),
            top           = ybot + TOOLTIP_BOUNDS_OFFSET,
            left          = xpos - (toolTipWidth / 2 ),
            $editorHolder = $("#editor-holder"),
            editorOffset = $editorHolder.offset();
        

        left = Math.max(left, editorOffset.left + TOOLTIP_BOUNDS_OFFSET);
        left = Math.min(left, editorOffset.left + $editorHolder.width() - toolTipWidth - TOOLTIP_BOUNDS_OFFSET - 10); 
        
        if (top < (editorOffset.top + $editorHolder.height() - toolTipHeight - TOOLTIP_BOUNDS_OFFSET)) {
            $errorToolTipContainer.removeClass("preview-bubble-above");
            $errorToolTipContainer.addClass("preview-bubble-below");
            $errorToolTipContainer.offset({
                left: left,
                top: top
            });
        } else {
            $errorToolTipContainer.removeClass("preview-bubble-below");
            $errorToolTipContainer.addClass("preview-bubble-above");
            top = ypos - TOOLTIP_BOUNDS_OFFSET - toolTipHeight;
            $errorToolTipContainer.offset({
                left: left,
                top: top
            });
        }
    }
    
    
    
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
        
        var lineError = getErrorForPos(pos);
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
     * the current document in the editor
     */
    var _currentDoc;
    
    /**
     * manage change event listener on document
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
    
    
    function documentChangeHandler() {
        hideErrorToolTip();
        changeOccured = true;
        scheduleRun();
    }
    
    
    var _currentPromise, 
        changeOccured = true;
    function run() {
        setCurrentDocument(DocumentManager.getCurrentDocument());
        
        if (!_currentDoc ||!changeOccured) {
            return;
        }
        
        removeAllMarks();
        changeOccured = false;

        (_currentPromise = CodeInspection.inspectFile(_currentDoc.file)).then(function (results) {
            // check if promise has not changed while inspectFile was running
            if (this !== _currentPromise || !results || changeOccured) {
                return;
            }

            errorsMap = results.reduce(function (errorsMap, item) { 
                if (item.result && item.result.errors) {
                    errorsMap = item.result.errors.reduce( function (errorsMap, error) {
                        var pos = error.pos,
                            endpos = error.endpos,
                            message = error.message,
                            type = error.type;
                        
                        if (!pos || pos.line < 0) {
                            return errorsMap;
                        }
                        
                        if (!endpos) {
                            var cm = _currentDoc._masterEditor._codeMirror,
                                token = cm. getTokenAt({
                                    line: pos.line,
                                    ch: pos.ch + 1
                                }),
                                index = token.end;
                            
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
                        
                        if (endpos.line === pos.line && endpos.ch === pos.ch && pos.ch > 0) {
                            pos.ch --;
                        }
                        
                        var lineErrors =  errorsMap[pos.line] || (errorsMap[pos.line] = []);
                           
                       
                        for (var i = 0, l = lineErrors.length; i < l; i++) {
                            var lineErr = lineErrors[i];
                            
                            //need to compare lines here also
                            if (pos.ch <= lineErr.endpos.ch && endpos.ch >= lineErr.pos.ch) {
                                lineErr.errors.push({
                                    message: message,
                                    type: type
                                });
                                return errorsMap;
                            }
                        }
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
    
    var timer;
    function scheduleRun() {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(run, 1000);
    }
    
    
   
    

    
    // Bootstraping ----------------------------------------------
    
    ExtensionUtils.loadStyleSheet(module, 'style.css');
    
    var _codeInspectionRegister = CodeInspection.register;
    CodeInspection.register = function register() {
        _codeInspectionRegister.apply(CodeInspection, arguments);
        run();
    };
    
    AppInit.appReady(function () {
        $(DocumentManager)
                .on('currentDocumentChange', function () {
                    run();
                })
                .on('documentSaved documentRefreshed', function (event, document) {
                    if (document === DocumentManager.getCurrentDocument()) {
                        run();
                    }
                });
        var editorHolder = $("#editor-holder")[0];
        // Note: listening to "scroll" also catches text edits, which bubble a scroll event up from the hidden text area. This means
        // we auto-hide on text edit, which is probably actually a good thing.
        editorHolder.addEventListener("mousemove", handleMouseMove, true);
        editorHolder.addEventListener("scroll", hideErrorToolTip, true);
        editorHolder.addEventListener("mouseout", hideErrorToolTip, true);
        
        
        $errorToolTipContainer = $(errorToolTipHTML).appendTo($("body"));
        $errorToolTipContent = $errorToolTipContainer.find(".error-tooltip-content");
        
        setTimeout(run, 500);
    });
    
    
});