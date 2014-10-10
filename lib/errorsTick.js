/*
 * Copyright 2014 François de Campredon
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the 'Software'), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */



define(function (require, exports) {
    'use strict';
    
    
    var CodeInspection      = brackets.getModule('language/CodeInspection'),
        WorkspaceManager    = brackets.getModule('view/WorkspaceManager'),
        _                   = brackets.getModule('thirdparty/lodash');
    
    
    var utils = require('./utils');
    
    
    /**
     * @private
     * edito indexed by file
     * 
     * @type Object.<string, Editor>
     */
    var fileToEditors = {};

    
    /**
     * @private
     * errors map indexed by file
     * 
     * @type {Object.<string, Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>>}
     */
    var fileErrors = {};
    
    
    /**
     * @private
     * @type {Array.<JQuery>}
     */
    var overlays = [];
    
   
    /**
     * @private
     * @type {Object.<string, {trackOffset: number, trackHt: number }}
     */
    var editorsTracksInfo = [];
    
    
    /**
     * @private
     * retrieve the scrollbar element associated to an editor
     * 
     * @param {Editor} editor
     * @return {Jquery}
     */
    function getScrollbar(editor) {
        // Be sure to select only the direct descendant, not also elements within nested inline editors
        return $(editor.getRootElement()).children(".CodeMirror-vscrollbar");
    }
    
    /**
     * @private
     * set trackInfo for a given editor
     * 
     * @param {Editor} editor
     * @param {{trackOffset: number, trackHt: number}} tackInfo
     */
    function setEditorTrackInfo(editor, trackInfo) {
        editorsTracksInfo[utils.getEditorFile(editor)] = trackInfo;
    }
    
    
    /**
     * @private
     * retrieve trackInfo for a given editor
     * 
     * @param {Editor} editor
     * @return {{trackOffset: number, trackHt: number}}
     */
    function getEditorTrackInfo(editor) {
        return editorsTracksInfo[utils.getEditorFile(editor)];
    }
    
    
    
    /**
     * @private
     * renders the ticks for a given file
     * 
     * @param {string} file
     */
    function renderTicks(file) {
        var errorsMap = fileErrors[file];
        var editor = fileToEditors[file];
        
        if (!editor || !errorsMap) {
            return;
        }
        
        var tackInfo = getEditorTrackInfo(editor);

        var html = Object.keys(errorsMap).map(function (line) {
            var top = Math.round(line / editor.lineCount() * tackInfo.trackHt) + tackInfo.trackOffset;
            top--;  // subtract ~1/2 the ht of a tickmark to center it on ideal pos

            var type = _.flatten(errorsMap[line].map(function (lineError) {
                return lineError.errors;
            })).reduce(function (type, error) {
                if (error.type === CodeInspection.Type.ERROR) {
                    return CodeInspection.Type.ERROR;
                }
                return type;
            }, CodeInspection.Type.WARNING);

            var className = type === CodeInspection.Type.WARNING ? 
                'tickmark-warning' : 
                'tickmark-error'
            ;
            return '<div class="'+className+'" style="top:' + top + 'px" data-error-line="' + line + '" ></div>';
        }).join('');

        $('.tickmark-track-error', editor.getRootElement()).append($(html));
    }
    
    /**
     * @private
     * clear the ticks for a given file
     */
    function clear(file) {
        var editor = fileToEditors[file];
        if (editor) {
            $('.tickmark-track-error', editor.getRootElement()).empty();
        }
    }
    
    /**
     * @private
     * refresh the ticks mark
     */
    function refresh() {
        fileToEditors = {};
        
        overlays.forEach(function ($overlay) {
            $overlay.remove();
            $overlay = null;
        });
        
        overlays = [];
        
        utils.getFullEditors().forEach(function (editor) {
            var file = utils.getEditorFile(editor);
            fileToEditors[file] = editor;
            
            
            var $sb = getScrollbar(editor);
            var $overlay = $('<div class="tickmark-track-error"></div>');
            $sb.parent().append($overlay);
            
            overlays.push($overlay);
            
            var trackHt = $sb[0].offsetHeight,
                trackOffset;

            if (trackHt > 0) {
                // Scrollbar visible: determine offset of track from top of scrollbar
                if (brackets.platform === 'win') {
                    trackOffset = 0;  // Custom scrollbar CSS has no gap around the track
                } else if (brackets.platform === 'mac') {
                    trackOffset = 4;  // Native scrollbar has padding around the track
                } else { //(Linux)
                    trackOffset = 2;  // Custom scrollbar CSS has assymmetrical gap; this approximates it
                }
                trackHt -= trackOffset * 2;

            } else {
                // No scrollbar: use the height of the entire code content
                var codeContainer = $(editor.getRootElement()).find('> .CodeMirror-scroll > .CodeMirror-sizer > div > .CodeMirror-lines > div')[0];
                trackHt = codeContainer.offsetHeight;
                trackOffset = codeContainer.offsetTop;
            }

            setEditorTrackInfo(editor, {trackHt: trackHt, trackOffset: trackOffset});
            renderTicks(file);
        });
    }
   
    
    
    /**
     * set the errors map for a given file
     * 
     * @param {Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>} errorsMap
     * @param {string} file
     */
    function setErrorsMap(errorsMap, file) {
        if (!errorsMap) {
            delete fileErrors[file];
            clear(file);
            return;
        }
        fileErrors[file] = errorsMap;
        renderTicks(file);
    }
    
    
    /**
     * @private
     * handle editor click
     * 
     * @param {Event} event
     */
    function handleMouseClick(event) {
        var hasError = utils.getFullEditors().some(function (editor) {
            if (utils.divContainsMouse($(editor.getRootElement()), event)) {
                var errors = getErrorsForMouse(event, utils.getEditorFile(editor));
                if (!errors.length) {
                    return;
                }
                editor.setSelection(errors[0].endpos, null, true);
                editor.focus();
                return true;
            }
        });
                
        if (hasError) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }
    
    /**
     * for a given mouse position and a given file 
     * return corresponding errors
     * 
     * @param {Event} event
     * @param {string} file
     */
    function getErrorsForMouse(event, file) {
        var errorsMap = fileErrors[file];
        if (!errorsMap) {
            return [];
        }
        return _.flatten(overlays.map(function ($overlay) {
            if (!utils.divContainsMouse($overlay, event, 2)) {
                return [];
            }
            var ticks = $overlay.find('.tickmark-error, .tickmark-warning').filter(function () {
                return utils.divContainsMouse($(this), event, 2, 5);
            });

            if (ticks.length === 0) {
                return [];
            }

            var line = ticks[0].dataset.errorLine;
            return errorsMap[line] ||  [];
        }));
        
    }
    
    
    /**
     * initialize the ticks manager
     */
    function init() {
        var editorHolder = $('#editor-holder')[0];
        editorHolder.addEventListener('mousedown', handleMouseClick, true);
        $(WorkspaceManager).on('workspaceUpdateLayout', function () {
            refresh();
        });
        refresh();
    }
    
    exports.init                = init;
    exports.setErrorsMap        = setErrorsMap;
    exports.getErrorsForMouse   = getErrorsForMouse;
});