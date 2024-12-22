// ==UserScript==
// @name         JSON Response Capture
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Capture and save JSON responses from web requests
// @author       N
// @match        *://*/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js
// ==/UserScript==

(function() {
    'use strict';

    // First, inject required styles
    const style = document.createElement('style');
    style.textContent = `
        .json-capture-panel {
            position: fixed;
            bottom: 1rem;
            right: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            transition: all 200ms;
            z-index: 10000;
        }
        .json-capture-panel.minimized {
            width: 3rem;
        }
        .json-capture-panel.expanded {
            width: 24rem;
        }
        .json-capture-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.5rem;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
            border-top-left-radius: 0.5rem;
            border-top-right-radius: 0.5rem;
        }
        .json-capture-content {
            max-height: 24rem;
            overflow: auto;
            padding: 1rem;
        }
        .json-capture-item {
            margin-bottom: 1rem;
            padding: 0.5rem;
            border: 1px solid #e5e7eb;
            border-radius: 0.375rem;
        }
        .json-capture-url {
            font-size: 0.875rem;
            color: #4b5563;
            margin-bottom: 0.25rem;
            word-break: break-all;
        }
        .json-capture-timestamp {
            font-size: 0.75rem;
            color: #6b7280;
            margin-bottom: 0.5rem;
        }
        .json-capture-json {
            font-size: 0.75rem;
            background: #f9fafb;
            padding: 0.5rem;
            border-radius: 0.375rem;
            overflow: auto;
            white-space: pre-wrap;
            max-height: 12rem;
        }
        .json-capture-button {
            padding: 0;
            background: none;
            border: none;
            cursor: pointer;
            color: #4b5563;
        }
        .json-capture-button:hover {
            color: #2563eb;
        }
        .json-capture-button.delete:hover {
            color: #dc2626;
        }
    `;
    document.head.appendChild(style);

    // Create the React component
    const { useState, useEffect } = React;

    function JsonCapturePanel() {
        const [captures, setCaptures] = useState([]);
        const [isMinimized, setIsMinimized] = useState(false);

        useEffect(() => {
            // Intercept fetch
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const response = await originalFetch.apply(this, args);
                const clone = response.clone();

                try {
                    const contentType = clone.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                        const json = await clone.json();
                        setCaptures(prev => [...prev, {
                            timestamp: new Date().toISOString(),
                            url,
                            data: json
                        }]);
                    }
                } catch (err) {
                    console.error('Error processing response:', err);
                }

                return response;
            };

            // Intercept XHR
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(...args) {
                this._url = args[1];
                return originalXHROpen.apply(this, args);
            };

            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', function() {
                    try {
                        const contentType = this.getResponseHeader('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            const json = JSON.parse(this.responseText);
                            setCaptures(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                url: this._url,
                                data: json
                            }]);
                        }
                    } catch (err) {
                        console.error('Error processing XHR response:', err);
                    }
                });

                return originalXHRSend.apply(this, args);
            };
        }, []);

        const handleSave = () => {
            const blob = new Blob([JSON.stringify(captures, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `json-captures-${new Date().toISOString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        const handleClear = () => {
            setCaptures([]);
        };

        return React.createElement('div', {
            className: `json-capture-panel ${isMinimized ? 'minimized' : 'expanded'}`
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                className: 'json-capture-header'
            }, [
                !isMinimized && React.createElement('div', {
                    key: 'title'
                }, `JSON Captures (${captures.length})`),
                React.createElement('div', {
                    key: 'controls',
                    style: { display: 'flex', gap: '0.5rem' }
                }, [
                    !isMinimized && React.createElement('button', {
                        key: 'save',
                        className: 'json-capture-button',
                        onClick: handleSave,
                        title: 'Save captures'
                    }, '💾'),
                    React.createElement('button', {
                        key: 'toggle',
                        className: 'json-capture-button',
                        onClick: () => setIsMinimized(!isMinimized),
                        title: isMinimized ? 'Expand' : 'Minimize'
                    }, isMinimized ? '⤢' : '⤡'),
                    !isMinimized && React.createElement('button', {
                        key: 'clear',
                        className: 'json-capture-button delete',
                        onClick: handleClear,
                        title: 'Clear captures'
                    }, '✕')
                ])
            ]),
            // Content
            !isMinimized && React.createElement('div', {
                key: 'content',
                className: 'json-capture-content'
            },
                captures.length === 0
                    ? React.createElement('div', {
                        style: { textAlign: 'center', color: '#6b7280' }
                    }, 'No JSON responses captured yet')
                    : captures.map((capture, index) =>
                        React.createElement('div', {
                            key: index,
                            className: 'json-capture-item'
                        }, [
                            React.createElement('div', {
                                key: 'url',
                                className: 'json-capture-url'
                            }, capture.url),
                            React.createElement('div', {
                                key: 'timestamp',
                                className: 'json-capture-timestamp'
                            }, capture.timestamp),
                            React.createElement('pre', {
                                key: 'json',
                                className: 'json-capture-json'
                            }, JSON.stringify(capture.data, null, 2))
                        ])
                    )
            )
        ]);
    }

    // Create container and render React component
    const container = document.createElement('div');
    document.body.appendChild(container);
    ReactDOM.render(React.createElement(JsonCapturePanel), container);
})();