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
    
    var CodeInspection   = brackets.getModule('language/CodeInspection'),
        _                = brackets.getModule('thirdparty/lodash');
    
    
    /**
     * remove all markers for a given editor
     * 
     * @param {Editor} editor
     */
    function removeAllMarks(editor) {
        if (editor.__epicLinterMarkers) {
            editor.__epicLinterMarkers.forEach(function (marker) {
                marker.clear();
            });
            
            delete editor.__epicLinterMarkers;
        }
    }
    
    /**
     * For all errors described in errorsMap mark corresponding part of the code in the given editor
     * 
     * @param {Editor} editor
     * @param {Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>}} errorsMap
     */
    function markErrors(editor, errorsMap) {
        if (!errorsMap) {
            return;
        }
        removeAllMarks(editor);
        editor.__epicLinterMarkers = _.flatten(Object.keys(errorsMap).map(function (line) {
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
    
    
    exports.markErrors = markErrors;
    exports.removeAllMarks = removeAllMarks;
});