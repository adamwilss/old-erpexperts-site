// ==UserScript==
// @name         NetSuite Smart Count Custom Item Lookup
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Enables the lookup of Items using a saved search to enable flexibility.
// @author       Steve Boot
// @match        https://*.app.netsuite.com/core/media/media.nl*
// @icon         https://www.netsuite.com/portal/assets/ico/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';

    const suiteletUrl = '/app/site/hosting/scriptlet.nl?script=customscript_e3_sc_item_lookup_sl&deploy=customdeploy_e3_sc_item_lookup_sl&input_string=';
    console.log('suiteletUrl', suiteletUrl);

    const _sendRequest = inputString => {
        // Create a new XMLHttpRequest object
        const xhr = new XMLHttpRequest();

        // Configure the request
        xhr.open('GET', suiteletUrl + inputString, true);

        // Send the request
        xhr.send();

        return xhr;
    };

    // Call when a field wants to do the lookup
    const _doLookup = (inputField, originalField) => {
        console.log('_doLookup::inputField.value', inputField.value);

        let inputValue = inputField.value;

        // Remove $1 from Code39/Code41 barcode values
        if (inputValue.startsWith('$1'))
        {
            inputValue = inputValue.replace('$1', '');
        }

        if (inputValue && inputField.value !== originalField.value)
        {
            inputField.value = '';
            inputField.placeholder = 'Please wait...';

            // Do the lookup
            _sendRequest(inputValue).onreadystatechange = (xhr => {
                // Check if the request is complete
                if (xhr.target.readyState === 4)
                {
                    // Check if the request was successful
                    if (xhr.target.status === 200)
                    {
                        const responseData = JSON.parse(xhr.target.responseText);
                        console.log('_doLookup::responseData', responseData);

                        if (responseData?.matches.length === 1)
                        {
                            // Single exact match

                            // Inject the value into the original field
                            originalField.value = responseData.matches[0].values.itemid;
                            console.log('_doLookup::originalField', originalField);

                            // Force the original functionality to do the rest
                            originalField.dispatchEvent(new Event('change'));
                            inputField.placeholder = '';
                        }
                        else if (responseData?.matches.length > 1)
                        {
                            // Handle multiple matches

                            // Create dropdown for user to choose item from
                            const selectDropdown = document.createElement('select');
                            selectDropdown.id = 'customitemselect';
                            selectDropdown.classList.add('input');
                            selectDropdown.setAttribute('data-v-42582c30', '');

                            const firstOption = document.createElement('option');
                            firstOption.innerText = '-- Select --';
                            selectDropdown.appendChild(firstOption);

                            responseData.matches.forEach(match => {
                                const option = document.createElement('option');
                                option.value = match.values.itemid;
                                option.innerText = `${match.values.itemid} ${match.values.salesdescription || match.values.formulatext_1}`;
                                selectDropdown.appendChild(option);
                            });

                            inputField.parentElement.appendChild(selectDropdown);

                            // Add functionality when an option is selected
                            selectDropdown.addEventListener('change', changeEv => {
                                // Inject the value into the original field
                                originalField.value = selectDropdown.value;
                                inputField.value = originalField.value;
                                console.log('_doLookup::originalField', originalField);

                                // Force the original functionality to do the rest
                                originalField.dispatchEvent(new Event('change'));

                                // Last of all, remove the select dropdown
                                selectDropdown.remove();
                                inputField.placeholder = '';
                            });
                        }
                        else
                        {
                            // No matches - show response
                            alert(JSON.stringify(responseData));
                            inputField.placeholder = '';
                        }

                        inputField.value = originalField.value;
                    } else {
                        console.error('Request failed with status:', xhr.target.status);
                    }
                }
            });
        }
    };

    // Detect correct context and add event listeners
    let interval = null;

    const _doIt = () =>
    {
        let inputElements = document.getElementsByTagName('input');

        for (let i = 0; i < inputElements.length; i++)
        {
            if (!inputElements[i].injectedCustomEvent && inputElements[i].id !== 'customlookup')
            {
                inputElements[i].injectedCustomEvent = true;
                inputElements[i].addEventListener('focus', focusEv => {
                    console.log('focus', focusEv);
                    if (focusEv.target.parentElement.parentElement.textContent.trim().toUpperCase() === 'SCAN OR ENTER ITEM')
                    {
                        // Hide the original input field
                        focusEv.target.style.display = 'none';

                        // Create a clone input field
                        const newInput = focusEv.target.cloneNode(false);
                        newInput.style.display = '';
                        newInput.id = 'customlookup';
                        focusEv.target.parentElement.appendChild(newInput);
                        newInput.focus();

                        // Add event listener to the clone that populates looked-up value in the original field and calls its change listener
                        newInput.addEventListener('change', changeEv => {
                            changeEv.preventDefault();

                            console.log('newInput changeEv', changeEv);
                            _doLookup(newInput, focusEv.target);
                        });
                        newInput.addEventListener('keyup', keyUpEv => {
                            keyUpEv.preventDefault();

                            if (keyUpEv.keyCode === 13) {
                                console.log('Enter pressed');
                                _doLookup(newInput, focusEv.target);
                            }
                        });
                        newInput.addEventListener('focus', focusEv => {
                            newInput.value = '';
                        });
                    }
                });
            }
        }
    }

    _doIt();
    interval = setInterval(_doIt, 1000);
})();