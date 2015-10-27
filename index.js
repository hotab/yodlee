// Copyright Craig Richardson. and other Contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var Q = require('q');
var request = require('request');

/**
 * Yodlee API driver for NodeJS
 * Sets the Cobrand credentials for API calls
 *
 * @module Yodlee
 * @constructor
 */
function Yodlee() {
    if (!(this instanceof Yodlee)) {
        return new Yodlee();
    }
}

/**
* Base URL for sandbox
* @private
*/
Yodlee.prototype.sandboxUrl = "https://yisandbox.yodleeinteractive.com/services/srest/private-{{sandboxuser}}/v1.0/";

/**
* Base URL for live
* @private
*/
Yodlee.prototype.liveUrl = "https://rest.developer.yodlee.com/services/srest/restserver/v1.0/";

/**
* Session tokens for Yodlee
* @private
*/
Yodlee.prototype.sessionTokens = {
    cobSessionToken: {
        token: null,
        expires: null
    },
    userSessionToken: {
        token: null,
        expires: null
    }
};

/**
 * Use the specified Cobrand details to sign requests
 * @param {object} opt Cobrand username and password
 *
 */
Yodlee.prototype.use = function use(opt) {

    var deferred = Q.defer();

    if (!opt.username || !opt.password) {
        deferred.reject('Invalid Cobrand Credentials: Empty ' + (!(opt.username) ? 'username' : 'password'));
    }

    this.sandbox = (opt.sandbox === true);
    this.username = opt.username;
    this.password = opt.password;

    if(opt.sandbox) {
        this.baseUrl = this.sandboxUrl.replace("{{sandboxuser}}", this.username);
    } else {
        this.baseUrl = this.liveUrl;
    }

    if(opt.cobSessionToken && opt.userSessionToken && opt.cobSessionExpires && opt.userSessionExpires) {

        // User can overrride tokens up front if they have cached valid tokens
        this.sessionTokens.cobSessionToken.token = opt.cobSessionToken;
        this.sessionTokens.cobSessionToken.expires = opt.cobSessionExpires;
        this.sessionTokens.userSessionToken.token = opt.userSessionToken;
        this.sessionTokens.userSessionToken.expires = opt.userSessionExpires;

        deferred.resolve(this.sessionTokens);

    } else if(!opt.cobSessionToken && !opt.userSessionToken && !opt.cobSessionExpires && !opt.userSessionExpires) {

        // cobLogin only required when tokens are not provided
        this.cobLogin().then(function(){ 
            deferred.resolve(this.sessionTokens);
        }.bind(this)).catch(function(e){
            deferred.reject(e);
        });

    } else {

        // By reaching here we know some of the tokens were provided but not all of them
        deferred.reject('When providing session tokens both tokens and accompanying expiration timestamps are required.');

    }

    return deferred.promise;

};

/**
 * Fetch the cobLogin object and save cobSessionToken in memory
 *
 */
Yodlee.prototype.cobLogin = function cobLogin() {

    var deferred = Q.defer();

    if (!this.username || !this.password) {
        deferred.reject('Invalid Cobrand Login: Empty ' + (!(this.username) ? 'username' : 'password'));
    }

    request.post({
        url: this.baseUrl + 'authenticate/coblogin',
        form: {
            cobrandLogin: this.username,
            cobrandPassword: this.password
        }
    }, function(err, response, body) {

        if (err || JSON.parse(body).Error) {
            deferred.reject(err || JSON.parse(body).Error[0].errorDetail);
        } else {
            
            var expires = new Date();

            this.sessionTokens.cobSessionToken.token = JSON.parse(body).cobrandConversationCredentials.sessionToken;
            this.sessionTokens.cobSessionToken.expires = expires.setMinutes(expires.getMinutes() + 20);

            deferred.resolve(JSON.parse(body));

        }

    }.bind(this));

    return deferred.promise;

 };

/**
 * Retrieves login object for the given user
 * @param {object} opt User username and password
 */
Yodlee.prototype.login = function login(opt) {

    var deferred = Q.defer();

    if (!opt.username || !opt.password) {
        deferred.reject('Invalid User Credentials: Empty ' + (!(opt.username) ? 'username' : 'password'));
    }

    this.getCobSessionToken().then(function(cobSessionToken){

        request.post({
            url: this.baseUrl + 'authenticate/login',
            form: {
                login: opt.username,
                password: opt.password,
                cobSessionToken: cobSessionToken
            }
        }, function(err, response, body) {

            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).Error[0].errorDetail);
            } else {

                var expires = new Date();

                this.sessionTokens.userSessionToken.token = JSON.parse(body).userContext.conversationCredentials.sessionToken;
                this.sessionTokens.userSessionToken.expires = expires.setMinutes(expires.getMinutes() + 20);

                deferred.resolve(JSON.parse(body));

            }

        }.bind(this));

    }.bind(this)).catch(function(e){
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Retrieves cobSessionToken from memory or cobLogin if expired / not set
 * @private
 */
Yodlee.prototype.getCobSessionToken = function getCobSessionToken() {

    var deferred = Q.defer();

    var date = new Date();

    if(this.sessionTokens.cobSessionToken.token != null && this.sessionTokens.cobSessionToken.expires > date.getTime()) {
        deferred.resolve(this.sessionTokens.cobSessionToken.token);
    } else {
        this.cobLogin().then(function(cobLogin) {
            deferred.resolve(cobLogin.cobrandConversationCredentials.sessionToken);
        }).catch(function(e) {
            deferred.reject(e);
        });
    }

    return deferred.promise;

};

/**
 * Retrieves userSessionToken from memory or login if expired / not set
 * @param {object} opt User username and password
 */
Yodlee.prototype.getUserSessionToken = function getUserSessionToken(opt) {

    var deferred = Q.defer();

    opt = opt || {};

    var date = new Date();

    if(this.sessionTokens.userSessionToken.token != null && this.sessionTokens.userSessionToken.expires > date.getTime()) {
        deferred.resolve(this.sessionTokens.userSessionToken.token);
    } else if (!opt.username || !opt.password) {
        deferred.reject('User Session expired, user credentials required: Empty ' + (!(opt.username) ? 'username' : 'password'));
    } else {
        this.login(opt).then(function(login) {
            deferred.resolve(login.userContext.conversationCredentials.sessionToken);
        }).catch(function(e) {
            deferred.reject(e);
        });
    }

    return deferred.promise;


};

/**
 * Retrieves both the userSessionToken and cobSessionToken from memory / fetches them from API if expired
 * @private
 */
Yodlee.prototype.getBothSessionTokens = function getBothSessionTokens(opt) {

    var deferred = Q.defer();

    this.getCobSessionToken().then(function(cobSessionToken){
        this.getUserSessionToken(opt).then(function(userSessionToken){
            deferred.resolve({
                cobSessionToken: cobSessionToken,
                userSessionToken: userSessionToken
            });
        }).catch(function(e){
            deferred.reject(e);
        });
    }.bind(this)).catch(function(e){
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Retrieves all site accounts for the authenticated user
 */
Yodlee.prototype.getAllSiteAccounts = function getAllSiteAccounts() {

    var deferred = Q.defer();

    this.getBothSessionTokens().then(function(tokens){
        request.post({
            url: this.baseUrl + 'jsonsdk/SiteAccountManagement/getAllSiteAccounts',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).Error[0].errorDetail);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });
    }.bind(this)).catch(function(e){
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Retrieves transactions summary for the authenticated user
 * @param {object} opt Optional args to call transaction
 */
Yodlee.prototype.executeUserSearch = function executeUserSearch(opt) {

    var deferred = Q.defer();

    opt = opt || {};

    this.getBothSessionTokens().then(function(tokens) {
            
        request.post({
            url: this.baseUrl + 'jsonsdk/TransactionSearchService/executeUserSearchRequest',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken,
                "transactionSearchRequest.containerType": opt.containerType || "All",
                "transactionSearchRequest.higherFetchLimit": opt.higherFetchLimit || "500",
                "transactionSearchRequest.lowerFetchLimit": opt.lowerFetchLimit || "1",
                "transactionSearchRequest.resultRange.endNumber": opt.endNumber || 5,
                "transactionSearchRequest.resultRange.startNumber": opt.startNumber || 1,
                "transactionSearchRequest.searchFilter.currencyCode": opt.currencyCode || "USD",
                "transactionSearchRequest.ignoreUserInput": opt.ignoreUserInput || "true"
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Retrieves transactions summary for the authenticated user
 * @param {object} opt Optional args to call transaction
 */
Yodlee.prototype.getUserTransactions = function getUserTransactions(opt) {

    var deferred = Q.defer();

    opt = opt || {};

    if(!opt.searchIdentifier) {
        deferred.reject('Invalid Search Identifier: Empty!');
    }

    this.getBothSessionTokens().then(function(tokens) {
            
        request.post({
            url: this.baseUrl + 'jsonsdk/TransactionSearchService/getUserTransactions',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken,
                "searchFetchRequest.searchIdentifier.identifier": opt.searchIdentifier,
                "searchFetchRequest.searchResultRange.startNumber": opt.startNumber || "1",
                "searchFetchRequest.searchResultRange.endNumber": opt.endNumber || "10"
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Gets the login form for a given Yodlee site ID
 * @param {object} opt args to get login form
 */
Yodlee.prototype.getSiteLoginForm = function getSiteLoginForm(opt) {

    var deferred = Q.defer();

    opt = opt || {};

    if (!opt.siteId) {
        deferred.reject('Invalid Site ID: Empty!');
    }

    this.getCobSessionToken().then(function(cobSessionToken) {

        request.post({
            url: this.baseUrl + 'jsonsdk/SiteAccountManagement/getSiteLoginForm',
            form: {
                'cobSessionToken': cobSessionToken,
                'siteId': opt.siteId
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Registers a new Yodlee user
 * @param {object} opt args to register user
 */
Yodlee.prototype.register = function register(opt) {

    var deferred = Q.defer();

    opt = opt || {};

    if (!opt.username || !opt.password || !opt.emailAddress) {
        deferred.reject('Cannot register user: Empty ' + (!(opt.username) ? 'username' : 
            (!(opt.password) ? 'password' : 'emailAddress')));
    }

    this.getCobSessionToken().then(function(cobSessionToken) {

        request.post({
            url: this.baseUrl + 'jsonsdk/UserRegistration/register3',
            form: {
                'cobSessionToken': cobSessionToken,
                'userCredentials.loginName': opt.username,
                'userCredentials.password': opt.password,
                'userProfile.emailAddress': opt.emailAddress,
                'userCredentials.objectInstanceType': 'com.yodlee.ext.login.PasswordCredentials'
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Search for a Yodlee site
 * @param {string} searchTerm
 */
Yodlee.prototype.searchSite = function searchSite(searchTerm) {

    var deferred = Q.defer();

    if (!searchTerm) {
        deferred.reject('Cannot search for sites with empty searchTerm');
    }

    this.getBothSessionTokens().then(function(tokens) {

        request.post({
            url: this.baseUrl + 'jsonsdk/SiteTraversal/searchSite',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken,
                'siteSearchString': searchTerm
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Unregister a user
 */
Yodlee.prototype.unregister = function unregister() {

    var deferred = Q.defer();

    this.getBothSessionTokens().then(function(tokens) {

        request.post({
            url: this.baseUrl + 'jsonsdk/UserRegistration/unregister',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Validate a user based on cobrand
 * @param {string} username args to validate Yodlee user
 */
Yodlee.prototype.validateUser = function validateUser(username) {

    var deferred = Q.defer();

    if (!username) {
        deferred.reject('Cannot validate user: Empty username');
    }

    this.getCobSessionToken().then(function(cobSessionToken) {

        request.post({
            url: this.baseUrl + 'jsonsdk/Login/validateUser',
            form: {
                'cobSessionToken': cobSessionToken,
                'userName': username
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Add site accounts
 * @param {number} siteId args to add site accounts
 */
Yodlee.prototype.addSiteAccounts = function addSiteAccounts(siteId, credentials) {

    var deferred = Q.defer();

    if (!siteId) {
        deferred.reject('Cannot validate user: Empty siteId');
    }

    if(!credentials) {
        deferred.reject('Cannot validate user: Empty credentials');
    }

    this.getBothSessionTokens().then(function(tokens){

        this.getSiteLoginForm({
            siteId: siteId
        }).then(function(loginForm) {

            var formObj = { 
                cobSessionToken: tokens.cobSessionToken,
                userSessionToken: tokens.userSessionToken,
                siteId: siteId,
                "credentialFields.enclosedType": "com.yodlee.common.FieldInfoSingle"
            };

            loginForm.componentList.forEach(function(value, index){

                if(value.fieldInfoType === "com.yodlee.common.FieldInfoChoice") {
                    value = value.fieldInfoList[0];
                }

                formObj["credentialFields[" + index + "].displayName"] = value.displayName;
                formObj["credentialFields[" + index + "].fieldType.typeName"] = value.fieldType.typeName;
                formObj["credentialFields[" + index + "].name"] = value.name;
                formObj["credentialFields[" + index + "].size"] = value.size;
                formObj["credentialFields[" + index + "].value"] = credentials[index];
                formObj["credentialFields[" + index + "].valueIdentifier"] = value.valueIdentifier;
                formObj["credentialFields[" + index + "].valueMask"] = value.valueMask;
                formObj["credentialFields[" + index + "].isEditable"] = value.isEditable;

            });

            request.post({
                url: this.baseUrl + 'jsonsdk/SiteAccountManagement/addSiteAccount1',
                form: formObj
            },
            function(err, response, body) {
                if (err || JSON.parse(body).Error) {
                    deferred.reject(err || JSON.parse(body).message);
                } else {
                    deferred.resolve(JSON.parse(body));
                }
            });

        }.bind(this)).catch(function(err) {
            deferred.reject(err);
        });

    }.bind(this)).catch(function(err){
        deferred.reject(err);
    });

    return deferred.promise;

};

/**
 * Get Site info
 * @param {number} siteId args to get Site info
 */
Yodlee.prototype.getSiteInfo = function getSiteInfo(siteId) {

    var deferred = Q.defer();

    if (!siteId) {
        deferred.reject('Cannot get site: Empty siteId');
    }

    this.getCobSessionToken().then(function(cobSessionToken) {

        request.post({
            url: this.baseUrl + 'jsonsdk/SiteTraversal/getSiteInfo',
            form: {
                'cobSessionToken': cobSessionToken,
                'siteFilter.reqSpecifier': 1,
                'siteFilter.siteId': siteId
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Get Site account
 * @param {number} siteAccountIds args to get Site info
 */
Yodlee.prototype.getSiteAccounts = function getSiteAccounts(siteAccountIds) {

    var deferred = Q.defer();

    if (!siteAccountIds) {
        deferred.reject('Cannot get site accounts: Empty siteAccountIds');
    }

    this.getBothSessionTokens().then(function(tokens) {

        var formParams = {
            'cobSessionToken': tokens.cobSessionToken,
            'userSessionToken': tokens.userSessionToken
        };

        siteAccountIds.forEach(function(siteAccountId, index){
            console.log(siteAccountId)
            formParams['memSiteAccIds[' + index + ']'] = siteAccountId;
        });

        request.post({
            url: this.baseUrl + 'jsonsdk/SiteAccountManagement/getSiteAccounts',
            form: formParams
        },
        function(err, response, body) {
            console.log(err);
            console.log(body);
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Get item summaries for site account
 * @param {number} siteAccountId args to get Site account item summaries
 */
Yodlee.prototype.getItemSummariesForSite = function getItemSummariesForSite(siteAccountId) {

    var deferred = Q.defer();

    if (!siteAccountId) {
        deferred.reject('Cannot get site: Empty siteAccountId');
    }

    this.getBothSessionTokens().then(function(tokens) {

        request.post({
            url: this.baseUrl + 'jsonsdk/DataService/getItemSummariesForSite',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken,
                'memSiteAccId': siteAccountId
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

/**
 * Remove site accounts
 * @param {number} siteAccountId args to delete Site accounts
 */
Yodlee.prototype.removeSiteAccount = function removeSiteAccount(siteAccountId) {

    var deferred = Q.defer();

    if (!siteAccountId) {
        deferred.reject('Cannot remove site accounts: Empty siteAccountId');
    }

    this.getBothSessionTokens().then(function(tokens) {

        request.post({
            url: this.baseUrl + 'jsonsdk/SiteAccountManagement/removeSiteAccount',
            form: {
                'cobSessionToken': tokens.cobSessionToken,
                'userSessionToken': tokens.userSessionToken,
                'memSiteAccId': siteAccountId
            }
        },
        function(err, response, body) {
            if (err || JSON.parse(body).Error) {
                deferred.reject(err || JSON.parse(body).message);
            } else {
                deferred.resolve(JSON.parse(body));
            }
        });

    }.bind(this)).catch(function(e) {
        deferred.reject(e);
    });

    return deferred.promise;

};

module.exports = Yodlee();