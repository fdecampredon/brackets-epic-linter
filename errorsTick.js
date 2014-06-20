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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */


/**
 * Manages tickmarks shown along the scrollbar track.
 * NOT yet intended for use by anyone other than the FindReplace module.
 * It is assumed that markers are always clear()ed when switching editors.
 */
define(function (require, exports, module) {
    'use strict';
    
    var _ = brackets.getModule('thirdparty/lodash');
    
    var Editor              = brackets.getModule('editor/Editor'),
        EditorManager       = brackets.getModule('editor/EditorManager'),
        PanelManager        = brackets.getModule('view/PanelManager'),
        CodeInspection      = brackets.getModule('language/CodeInspection');
    
    var divContainsMouse = require('./utils').divContainsMouse;
    
     /**
     * Editor the markers are currently shown for, or null if not shown
     * @type {?Editor}
     */
    var editor;
    
    /**
     * Top of scrollbar track area, relative to top of scrollbar
     * @type {number}
     */
    var trackOffset;
    
    /**
     * Height of scrollbar track area
     * @type {number}
     */
    var trackHt;
    
    /**
     * Text positions of markers
     * @type {!Array.<{line: number, ch: number}>}
     */
    var errorsMap = {};
    
    
    var $overlay;
    
    
    function _getScrollbar(editor) {
        // Be sure to select only the direct descendant, not also elements within nested inline editors
        return $(editor.getRootElement()).children('.CodeMirror-vscrollbar');
    }
    
    /** Measure scrollbar track */
    function _calcScaling() {
        var $sb = _getScrollbar(editor);
        
        trackHt = $sb[0].offsetHeight;
        
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
    }

    /** Add all the given tickmarks to the DOM in a batch */
    function _renderTicks(errorsMap) {
        var html = Object.keys(errorsMap).map(function (line) {
            var top = Math.round(line / editor.lineCount() * trackHt) + trackOffset;
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
     * Clear any markers in the editor's tickmark track, but leave it visible. Safe to call when
     * tickmark track is not visible also.
     */
    function clear() {
        if (editor) {
            $('.tickmark-track-error', editor.getRootElement()).empty();
            errorsMap = {};
        }
    }
    
    /** Add or remove the tickmark track from the editor's UI */
    function setVisible(curEditor, visible) {
        // short-circuit no-ops
        if ((visible && curEditor === editor) || (!visible && !editor)) {
            return;
        }
        
        if (visible) {
            console.assert(!editor);
            editor = curEditor;
            
            // Don't support inline editors yet - search inside them is pretty screwy anyway (#2110)
            if (editor.isTextSubset()) {
                return;
            }
            
            var $sb = _getScrollbar(editor);
            $overlay = $('<div class="tickmark-track-error"></div>');
            $sb.parent().append($overlay);
            
            _calcScaling();
            
            // Update tickmarks during editor resize (whenever resizing has paused/stopped for > 1/3 sec)
            $(PanelManager).on('editorAreaResize.errorTicks', _.debounce(function () {
                if (Object.keys(errorsMap).length) {
                    _calcScaling();
                    $overlay.empty();
                    _renderTicks(errorsMap);
                }
            }, 300));
            
    
        } else {
            $overlay.remove();
            $overlay = null;
            editor = null;
            errorsMap = {};
            $(PanelManager).off('editorAreaResize.errorTicks');
        }
    }
    
    function setErrorsMap(value) {
        errorsMap = value || {};
        _renderTicks(errorsMap);
    }
    
    
    
    
    function handleMouseClick(event) {
        var errors = getErrorsForMouse(event);
        if (!errors.length) {
            return;
        }
        
        editor.setSelection(errors[0].endpos, null, true);
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    
    function getErrorsForMouse(event) {
        if(!$overlay) {
            return [];
        }
        if (!divContainsMouse($overlay, event, 2)) {
            return [];
        }
        var ticks = $overlay.find('.tickmark-error').filter(function () {
            return divContainsMouse($(this), event, 2, 5);
        });
        
        if (ticks.length === 0) {
            return [];
        }
        
        var line = ticks[0].dataset.errorLine;
        return errorsMap[line] ||  [];
    }
    
    
    function init() {
        var editorHolder = $('#editor-holder')[0];
        editorHolder.addEventListener('click', handleMouseClick, true);
    }
    
    exports.init                = init;
    exports.getErrorsForMouse   = getErrorsForMouse;
    exports.setErrorsMap        = setErrorsMap;
    exports.clear               = clear;
    exports.setVisible          = setVisible;
});