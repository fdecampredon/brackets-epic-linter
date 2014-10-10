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

define(function (require, exports) {
    'use strict';
    
    
    var  _                = brackets.getModule('thirdparty/lodash');
    
    var errorToolTipHTML  = require('text!./errortoolip.html'),
        errorsTick        = require('./errorsTick'),
        utils             = require('./utils');
    
        
    
    var TOOLTIP_BOUNDS_OFFSET          = 8;    // offset between tooltip and position of the cursor / or bounds of the editor

    
    
    
    /**
     * @private
     * error tooltip container
     * 
     * @type {JQuery}
     */
    var $errorToolTipContainer; 
    
    /**
     * @private
     * errot tooltip content holder
     * 
     * @type {JQuery}
     */
    var $errorToolTipContent;
    
    /**
     * @private
     * list of managed editors
     * 
     * @type {Array.<Editor>}
     */
    var editors;
    
    
    /**
     * @private
     * errors map by file
     * 
     * @type {Object.<string, Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>>}
     */
    var fileErrors = {};
    
    
    /**
     * last position handled 
     * 
     * @type {line: number, ch: number}
     */
    var lastPos;
    
    /**
     * set the errors map for a given file
     * 
     * @param {Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>} errorsMap
     * @param {string} file
     */
    function setErrorsMap(errorsMap, file) {
        if (!errorsMap) {
            delete fileErrors[file];
            return;
        }
        fileErrors[file] = errorsMap;
        hideErrorToolTip();
    }
    
    
    /**
     * @private
     * hide the error tooltip
     */
    function hideErrorToolTip() {
        $errorToolTipContainer.hide();
        $errorToolTipContent.html('');
    }
    
    /**
     * if the errorsMap contains errors for the given position returns that error
     * else returns null
     */
    function getLineErrorForPos(pos, file) {
        var lineErrors;
        if (fileErrors[file] && (lineErrors = fileErrors[file][pos.line])) {
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
     * @private
     * position the tooltip below the marked error, centered
     * but always in the bound of the editor
     * 
     * @param {number} xpos
     * @param {number} ypos
     * @param {number} ybot
     */
    function positionToolTip(xpos, ypos, ybot) {
        $errorToolTipContainer.offset({
            left: 0,
            top: 0
        });
        $errorToolTipContainer.css('visibility', 'hidden');
        
        window.requestAnimationFrame(function () {
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
            
            $errorToolTipContainer.css('visibility', 'visible');
        });
    }
    
    
    /**
     * @private
     * handle mouse move event
     * 
     * @param {Event} event
     */
    function handleMouseMove(event) {
        if (event.which) {
            // Button is down - don't show popovers while dragging
            hideErrorToolTip();
            return;
        }
        
        var editor;
        
        editors.forEach(function (_editor) {
            var $el = $(_editor.getRootElement());
            if (!editor && utils.divContainsMouse($el, event, 10, 10)) {
                editor = _editor;
            } else if (utils.divContainsMouse($el, event, 0, 0)) {
                editor = _editor;
            }
        });
        
        if (!editor) {
            hideErrorToolTip();
            return;
        }
        // Find char mouse is over
        var cm = editor._codeMirror,
            pos = cm.coordsChar({left: event.clientX, top: event.clientY});


        var lineErrors, coord;
        // No preview if mouse is past last char on line
        if (pos.ch >= editor.document.getLine(pos.line).length) {
            lineErrors = errorsTick.getErrorsForMouse(event, utils.getEditorFile(editor));
            if (!lineErrors.length) {
                hideErrorToolTip();
                return;
            }
            coord = {
                left: event.clientX,
                top: event.clientY, 
                bottom: event.clientY
            };
        } else {
            // Bail if mouse is on same char as last event
            if (lastPos && lastPos.line === pos.line && lastPos.ch === pos.ch) {
                return;
            }
            lastPos = pos;
            var lineError = getLineErrorForPos(pos, editor.document.file.fullPath);
            if (!lineError) {
                hideErrorToolTip();
                return;
            }
            lineErrors = [lineError];
            coord = cm.charCoords(pos);
        }
        
        $errorToolTipContent.html(
            _.flatten(lineErrors.map(function (lineError) {
                return lineError.errors.map(function (error) {
                    return error.message; 
                });
            })).join('<br/>')
        );
        
        $errorToolTipContainer.show();
        positionToolTip(coord.left, coord.top, coord.bottom);
    }
    
    
    /**
     * @private
     * handle mouse out event
     * 
     * @param {Event} event
     */
    function handleMouseOut(event) {
        var $editorHolder = $('#editor-holder');
        if (!utils.divContainsMouse($editorHolder, event, 10, 10)) {
            hideErrorToolTip();
        }
    }
    
    
    
    /**
     * initialize the tooltip
     * 
     * @param {Array.<editor>} _editors the list of editors managed by the plugin 
     */
    function init(_editors) {
        editors = _editors;
        var editorHolder = $('#editor-holder')[0];
        // Note: listening to 'scroll' also catches text edits, which bubble a scroll event up from the hidden text area. This means
        // we auto-hide on text edit, which is probably actually a good thing.
        editorHolder.addEventListener('mousemove', handleMouseMove, true);
        editorHolder.addEventListener('scroll', hideErrorToolTip, true);
        editorHolder.addEventListener('mouseout', handleMouseOut, true);
        
        
        $errorToolTipContainer = $(errorToolTipHTML).appendTo($('body'));
        $errorToolTipContent = $errorToolTipContainer.find('.error-tooltip-content');
        
    }
    
    exports.init = init;
    exports.setErrorsMap = setErrorsMap;
    
});