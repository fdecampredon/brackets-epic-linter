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



/**
 * Manages tickmarks shown along the scrollbar track.
 * NOT yet intended for use by anyone other than the FindReplace module.
 * It is assumed that markers are always clear()ed when switching editors.
 */
define(function (require) {
    'use strict';
    
    
    var CodeInspection = brackets.getModule('language/CodeInspection');
    var utils = require('./utils');
    
    
    /**
     * a Lint is an object 
     * 
     * @constructor
     */
    function LintSession(document) {
        
        /**
         * @private
         * the errors retrieved by this session
         * 
         * @type {Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>}}
         */
        var errorsMap = {};
        
        
        /**
         * @private
         * a flag indicating if a change occured inside the document 
         * 
         * @type {boolean}
         */
        var changeOccured = true;
        
        
        /**
         * Promise of the returned by the last call to inspectFile or null if linting is disabled. 
         * Used to prevent any stale promises to cause updates of the UI.
         *
         * @private
         * @type {$.Promise}
         */
        var _currentPromise;
        
        /**
         * @private 
         * Event handler, handle the event notifying that a change occured inside of the document
         */
        function document_changeHandler() {
            changeOccured = true;
            scheduleRun();
        }
        
        /**
         * @private
         * @type {LintSession}
         */
        var self = this;
        
        /**
         * Run the inspector
         */
        function run() {

            // if there is no document open, or if no change has occured since the last 
            // session we does not need to rerun the inspection
            if (!document || !changeOccured) {
                return;
            }

            changeOccured = false;
            
            $(self).trigger('lintingStart', [self]);
            
            (_currentPromise = CodeInspection.inspectFile(document.file)).then(function (results) {
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
                                var cm = document._masterEditor._codeMirror,
                                    token = cm.getTokenAt({
                                        line: pos.line,
                                        ch: pos.ch + 1
                                    }),
                                    index = token ? token.end : -1;

                                // if no token has been retrieved we just put the end position 
                                // at the end of the line
                                if (index < pos.ch) {
                                    var line = document.getLine(pos.line);
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
                                if (utils.isPosInferiorOrEqual(pos, lineErr.endpos) && utils.isPosInferiorOrEqual(lineErr.pos, endpos)) {
                                    lineErr.errors.push({
                                        message: message,
                                        type: type
                                    });
                                    if (utils.isPosInferiorOrEqual(pos, lineErr.pos)) {
                                        lineErr.pos = pos;
                                    }
                                    if (utils.isPosInferiorOrEqual(lineErr.endpos, endpos)) {
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
                
                $(self).trigger('errorMapChanged', [self]);
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
        
        
        /**
         * The document associated to this session
         * 
         * @type {Document}
         */
        this.document = document;
        
        /**
         * return the errors retrieved by this session, errors are regrouped by line, and grouped inside a line by position
         * 
         * @type {Object.<number,{ startPos: {line:number, ch: number}, endPos: {line:number, ch: number}, errors: Array.<{type: string, message: string}> }[]>}
         */
        this.getErrorsMap = function () {
            return errorsMap;
        };
        
        /**
         * dispose the sessions
         */
        this.dispose = function () {
            $(document).off('change', document_changeHandler);
        };
        
        $(document).on('change', document_changeHandler);
        run();
    }
    
    
    
    
    return LintSession;
});
    