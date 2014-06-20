/*jslint browser:true, devel:true, unused:true*/
/*global define, brackets, $ */

define(function (require) {
    'use strict';
    
    var EditorManager    = brackets.getModule('editor/EditorManager');
    
    var errorToolTipHTML  = require('text!errortoolip.html'),
        $errorToolTipContainer,    // error tooltip container
        $errorToolTipContent;      // errot tooltip content holder
    
    var TOOLTIP_BOUNDS_OFFSET          = 8;    // offset between tooltip and position of the cursor / or bounds of the editor

    /**
     * and error maps containing information about the last linting session
     */
    var errorsMap;
    
    function setErrorsMap(_errorsMap) {
        errorsMap = _errorsMap;
        hideErrorToolTip();
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
    function handleMouseMove(event) {
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
            pos = cm.coordsChar({left: event.clientX, top: event.clientY});

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
        /*if (!lineError) {
            errorTicks.get
        }*/
        if (lineError) {
            $errorToolTipContent.html(lineError.errors.map(function (error) {
                return error.message;    
            }).join('<br/>'));
            var coord = cm.charCoords(pos);
            $errorToolTipContainer.show();
            positionToolTip(coord.left, coord.top, coord.bottom);
        }
    }
    
    
    
    
    // Bootstraping ----------------------------------------------
    function init() {
        var editorHolder = $('#editor-holder')[0];
        // Note: listening to 'scroll' also catches text edits, which bubble a scroll event up from the hidden text area. This means
        // we auto-hide on text edit, which is probably actually a good thing.
        editorHolder.addEventListener('mousemove', handleMouseMove, true);
        editorHolder.addEventListener('scroll', hideErrorToolTip, true);
        editorHolder.addEventListener('mouseout', hideErrorToolTip, true);
        
        
        $errorToolTipContainer = $(errorToolTipHTML).appendTo($('body'));
        $errorToolTipContent = $errorToolTipContainer.find('.error-tooltip-content');
        
    }
    
    return {
        init: init,
        setErrorsMap: setErrorsMap
    };
    
});