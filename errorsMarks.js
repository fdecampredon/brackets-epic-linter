/*jslint browser:true, devel:true, unused: true*/
/*global define, brackets*/

define(function () {
    'use strict';
    
    var CodeInspection   = brackets.getModule('language/CodeInspection'),
        _                = brackets.getModule('thirdparty/lodash');
    
    
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
    function markErrors(editor, errorsMap) {
        if (!errorsMap) {
            return;
        }
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
    
    
    
    return {
        markErrors: markErrors,
        removeAllMarks: removeAllMarks
    };
});