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
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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