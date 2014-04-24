/*jslint browser:true, devel:true*/
/*global define, brackets, $ */

define(function (require, exports, module) {
    'use strict';
    
    var AppInit          = brackets.getModule('utils/AppInit'),
        ExtensionUtils   = brackets.getModule('utils/ExtensionUtils'),
        EditorManager    = brackets.getModule('editor/EditorManager'),
        LanguageManager  = brackets.getModule('language/LanguageManager'),
        DocumentManager  = brackets.getModule('document/DocumentManager'),
        CodeInspection   = brackets.getModule('language/CodeInspection'),
        _                = brackets.getModule('thirdparty/lodash');
    
    
    require('third_party/bootstrap-tooltip');
    
    
    var _markers, _widgets;
    
    function removeAllMarks() {
        if (_currentDoc && _currentDoc._masterEditor && _widgets) {
            var editor = _currentDoc._masterEditor;
            _widgets.forEach(function (widget) {
                editor._codeMirror.removeLineWidget(widget);
            });
        }
        if (_markers) {
            _markers.forEach(function (marker) {
                marker.clear();
            });
        } 
    }
    
    function markErrors(errors) {
        var editor = _currentDoc._masterEditor;
        
        errors = errors.filter(function (error) {
            if (!error.pos || error.pos < 0) {
                return false;
            }
            if (!error.endpos) {
                var line = _currentDoc.getLine(error.pos.line);
                if (typeof line === 'undefined') {
                    return false;
                }
                error.endpos = {
                    line: error.pos.line,
                    ch: line.length 
                };
            }
            return true;
        });
        


        _markers = errors.map(function (error) {
            if (error.endpos) {
                var className = error.type === CodeInspection.Type.WARNING ? 
                    'linter-warning' : 
                    'linter-error'
                ;
                return editor._codeMirror.markText(error.pos, error.endpos, { 
                    className: className,
                    title: error.message
                });
            }
        });
        
        
        /*_widgets = errors.map(function (error) {
            if (error.endpos) {
                var className = error.type === CodeInspection.Type.WARNING ? 
                    'linter-warning' : 
                    'linter-error'
                ;
                
                var msg = document.createElement("div");
                var icon = msg.appendChild(document.createElement("span"));
                icon.innerHTML = "!!";
                icon.className = "lint-error-message-icon";
                msg.appendChild(document.createTextNode(error.message));
                msg.className = "lint-error-message";
                
                return editor._codeMirror.addLineWidget(error.pos.line, msg, {coverGutter: false, noHScroll: true});
            }
        });*/
        
    }
    
    function errorOverHandler() {
        console.log(arguments);
    }
    
    
    var _currentDoc;
    function setCurrentDocument(document) {
        if (_currentDoc === document) {
            return;
        }
        
        var editor;
        if (_currentDoc) {
            $(_currentDoc).off('change', documentChangeHandler);
        }
        
        _currentDoc = document;
        
        if (_currentDoc) {
            $(_currentDoc).on('change', documentChangeHandler);
        }
    }
    
    function documentChangeHandler() {
        scheduleRun();
    }
    
    var _currentPromise;
    function run() {
        removeAllMarks();
        
        setCurrentDocument(DocumentManager.getCurrentDocument());
        
        if (!_currentDoc) {
            return;
        }

        (_currentPromise = CodeInspection.inspectFile(_currentDoc.file)).then(function (results) {
            // check if promise has not changed while inspectFile was running
            if (this !== _currentPromise || !results) {
                return;
            }

            var errors = results.reduce(function (a, item) { 
                return item.result ? 
                        a.concat(item.result.errors) : 
                        a; 
            }, []);

            markErrors(_.cloneDeep(errors));
        });
    }
    
    var timer;
    function scheduleRun() {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(run, 1000);
    }
   
    
    var _codeInspectionRegister = CodeInspection.register;
    CodeInspection.register = function register() {
        _codeInspectionRegister.apply(CodeInspection, arguments);
        run();
    };
    
    ExtensionUtils.loadStyleSheet(module, 'style.css');
    
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
        run();
    });
    
    
});