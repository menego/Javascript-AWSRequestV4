/**
 * Created by Nicola Meneghetti <menego1983@gmail.com>
 * Version 1.1
 *
 * This class has the purpose to create a Canonical Request for Signature Version 4
 * in order to call AWS services with federated identities via HTTP requests.
 * Reference <a href="http://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html">here</a>
 * <b>DEPENDENCY: Crypto-js, you can download it <a href="https://code.google.com/archive/p/crypto-js/">here</a> or use a CDN.</b>
 */
class AWSRequestSV4{

	/**
	 * Constructor for the class
	 *
	 * @param {Object} options
	 * @param {Object} options.awsCredentials this has to be the AWS.config.credentials object obtained after logging in with Cognito Federated Identities
	 * @param {String} options.method the request http method: GET, PUT, POST, PATCH, DELETE
	 * @param {Boolean} options.async to make the request asynchronous or not
	 * @param {String} options.url the full url of the Api Gateway endpoint <i>https://xyz123.execute-api.&lt;region>.amazonaws.com/&lt;deploy_instance>/&lt;endpoint></i>
	 * @param {Object} options.params a simple plain javascript object containing the parameters of the request, if the method is of type GET the params will be converted in querystring format
	 * @param {String} options.region the AWS region of the service you are making the request for
	 * @param {String} options.service the AWS standard service name, for a the whole list visit http://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#genref-aws-service-namespaces
	 * @param {Function} [options.onSuccess(resp)] an optional callback function that wil be executed once the request succeeds, resp param is an object containing the <i>readyState<i>, the <i>status<i> and the <i>responseText<i>
	 * @param {Function} [options.onFailure(resp)] an optional callback function that wil be executed once the request fails, resp param is an object containing the <i>readyState<i>, the <i>status<i> and the <i>responseText<i>
	 */
	constructor(options) {

		this.awsCredentials = options.awsCredentials;
		this.service = options.service;
		this.region = options.region;
		this.method = options.method.trim().toUpperCase();
		this.URI = this.getCanonicalURI(options.url);
		this.params = options.params;
		this.queryString = this.getCanonicalQueryString(options.params);

		let headers = {
			'Host': this.getHost(options.url),
			'X-Amz-Date': this.getISO8601Date()
		};

		if(typeof options.params !== 'undefined'
			&& options.params !== null
			&& Object.keys(options.params).length > 0
			&& options.params.constructor === Object) {
            if (this.method !== 'GET') {
                headers['Content-Type'] = 'application/json';
            }
            else {
                //in case of get request we append the params to the url
                options.url += '?' + this.toQueryString(options.params);
            }
        }
        this.request = new XMLHttpRequest();
        this.request.open(this.method, options.url, options.async);
        this.request.onreadystatechange = function() {
				//attach the callback
				if (this.readyState === 4 && this.status === 200) {

					if(options.onSuccess && typeof options.onSuccess === 'function')
                        options.onSuccess({
							readyState: this.readyState,
							status: this.status,
                            responseText: this.responseText
						});
				}
				else{
                    if(options.onFailure && typeof options.onFailure === 'function')
                        options.onFailure({
                            readyState: this.readyState,
                            status: this.status,
                            responseText: this.responseText
                        });
				}
        };

		this.prepareHeadersEntries(headers);
	}

	/**
	 * Method to get the request in canonical form once that all fields have been set.
	 *
	 * @returns {string} canonical request
	 */
	getCanonicalRequest(){

		return this.method + '\n' +
			this.URI + '\n' +
			this.queryString + '\n' +
			this.getCanonicalHeadres() + '\n' +
			this.getSignedHeaders() + '\n' +
			this.getHashedPayload();
	}

	/**
	 * Extracts the host information and saves it as object variable.
	 *
	 * @param url
	 */
	getHost(url){

		let regex = '//';
		let begin = url.indexOf(regex);
		if(begin !== -1){
			url = url.substring(begin + regex.length);
			let endRegex = '/';
			let end = url.indexOf(endRegex);
			if(end !== -1){
				url = url.substring(0, end);
			}
		}
		return url;
	}

	/**
	 * Extracts the uri and returns the normalized paths according to RFC 3986.
	 *
	 * @param {String} url
	 * @returns {string}
	 */
	getCanonicalURI(url){

		let regex = '//';
		let begin = url.indexOf(regex);
		if(begin !== -1){
			url = url.substring(begin + regex.length);
			regex = '/';
			let endRegex = '?';
			begin = url.indexOf(regex);
			let end = -1;
			if(begin !== -1){
				url = url.substring(begin);
				end = url.indexOf(endRegex);
			}
			if(end !== -1){
				url = url.substring(0, end);
			}
		}
		/*
		if(url.charAt(url.length-1) !== '/'){
			url += '/';
		}
		*/
		url = url.toLowerCase().trim();
		return encodeURI(url);
	}

	/**
	 * Based on the type of <i>elem</i> parameters:
	 * If the type is String, extracts, if any, the querystring part of the url
	 * and normalize it according to RFC 3986.
	 * If the type is Object and the method is GET, creates a querystring representation
	 * and normalize it according to RFC 3986.
	 *
	 * @param {String|Object} elem
	 * @returns {string}
	 */
	getCanonicalQueryString(elem){

		let cqs = '';
		if(typeof elem === 'string') {
			let regex = '?';
			let begin = elem.indexOf(regex);
			if (begin !== -1) {
				cqs = elem.substring(begin + regex.length)
					.trim();
				if (cqs.indexOf('&') !== -1) {
					let qsArray = cqs.split("&")
						.sort();
					cqs = qsArray.join("&")
						.trim();
				}
			}
		}
		else
			if(typeof elem === 'object'
			&& this.method === 'GET'){

			let qsArray = [];
			Object.keys(elem)
				.forEach(function(key, index){
				qsArray[index] = (key + '=' + elem[key]);
			});
			cqs = qsArray.sort()
				.join("&")
				.trim();
		}
		return encodeURI(cqs);
	}

	/**
	 * Extracts the headers from passed object, set them to the request and normalize them for the canonical request.
	 * The normalized values are saved in the <i>headers</i> variable.
	 *
	 * @param reqHeaders
	 */
	prepareHeadersEntries(reqHeaders){

		if(typeof reqHeaders !== 'undefined'
			&& reqHeaders !== null){

			let $self = this;
			let objectHeaders = this.headers = [];
			Object.keys(reqHeaders).forEach(function(key) {

				//host header is set automatically
                if(key !== 'Host')
					$self.request.setRequestHeader(key, reqHeaders[key]);

				let newKey = key.trim()
					.replace('  ',' ')
					.toLowerCase();
				let newVal = reqHeaders[key].trim();
				while(newVal.indexOf('  ') !== -1)
					newVal = newVal.replace('  ',' ');

				objectHeaders[newKey] = newVal;
			});
		}
		else{
			console.error("function parameter 'reqHeaders' does not contains any headers.");
		}
	}

	/**
	 * Returns the headers of the request in canonical form.
	 *
	 * @returns {string}
	 */
	getSignedHeaders(){

		return Object.keys(this.headers).sort().join(';');
	}

	/**
	 * Returns the headers entries of the request in canonical form.
	 *
	 * @returns {string}
	 */
	getCanonicalHeadres(){

		let canonicalHeadersEntry = "";
		let objectHeaders = this.headers;
		Object.keys(objectHeaders).sort().forEach(function(key) {
			canonicalHeadersEntry += key + ':' + objectHeaders[key] + '\n';
		});
		return canonicalHeadersEntry;
	}

	/**
	 * Returns the hashed payload of the request as a lowercase hexadecimal string.
	 *
	 * @returns {string}
	 */
	getHashedPayload(){

		if(this.method === 'GET' )
			return CryptoJS.SHA256('')
				.toString()
				.toLowerCase();
		else
			return CryptoJS.SHA256(JSON.encode(this.params))
				.toString()
				.toLowerCase();
	}

	/**
	 * Returns the SHA-256 hashed canonical request represented as a string of
	 * lowercase hexademical characters.
	 *
	 * @returns {string}
	 */
	getCanonicalRequestDigest(){

		return CryptoJS.SHA256(this.getCanonicalRequest())
			.toString()
			.toLowerCase();
	}

    /**
	 * Utility method to convert a simple javascript object into query string.
     * @param obj
     * @returns {string}
     */
    toQueryString(obj) {
        let str = [];
        for(let p in obj)
            if (obj.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        return str.join("&");
    }

	/**
	 * Returns a string representing the current date in YYYYMMDD format.
	 *
	 * @returns {string}
	 */
	getDate(){

		const date = new Date();
		let year = date.getFullYear();
		let month = date.getMonth()+1;
		month = (month<10)?('0'+month):month;
		let day = date.getUTCDate();
		day = (day<10)?('0'+day):day;
		return '' + year + month + day;
	}

	/**
	 * Returns a string representing the current time in ISO8601 format
	 * YYYYMMDD'T'HHMMSS'Z'
	 *
	 * @returns {string}
	 */
	getISO8601Date(){

		const date = new Date();
		let hour = date.getUTCHours();
		hour = (hour<10)?('0'+hour):hour;
		let minutes = date.getMinutes();
		minutes = (minutes<10)?('0'+minutes):minutes;
		let seconds = date.getSeconds();
		seconds = (seconds<10)?('0'+seconds):seconds;
		return this.getDate() + 'T' + hour + minutes + seconds + 'Z';
	}

	/**
	 * Creates the signature to add to the request.
	 *
	 * @returns {string}
	 */
	getSignature(){

		//create signing key
		let kDate = CryptoJS.HmacSHA256(this.getDate(),"AWS4" + this.awsCredentials.secretAccessKey);
		let kRegion = CryptoJS.HmacSHA256(this.region,kDate);
		let kService = CryptoJS.HmacSHA256(this.service,kRegion);
		let signignKey =  CryptoJS.HmacSHA256("aws4_request",kService);


		//create the string to sign
		let stringToSign = 'AWS4-HMAC-SHA256\n'
				+ this.headers['x-amz-date'] + '\n'
				+ this.getDate() + '/' + this.region + '/' + this.service + '/aws4_request\n'
				+ this.getCanonicalRequestDigest();

		console.log('String to sign');
		console.log(stringToSign);

		//create the signature
		return CryptoJS.HmacSHA256(stringToSign,signignKey).toString();
	}

	/**
	 * Prepare the request adding the Authorization and the X-Amz-Security-Token
	 * headers.
	 * The X-Amz-Security-Token is needed because we are accessing AWS resources
	 * with Cognito Federated Identities.
	 */
	prepareRequest(){

		let request = this.request;

		//create the Authorization header
		let authorization = 'AWS4-HMAC-SHA256 '
			+ 'Credential=' + this.awsCredentials.accessKeyId + '/' + this.getDate() + '/' + this.region + '/' + this.service + '/aws4_request, '
			+ 'SignedHeaders=' + this.getSignedHeaders() + ', '
			+ 'Signature=' + this.getSignature();

		//add the security tokens to the request
		request.setRequestHeader('Authorization', authorization);
		request.setRequestHeader('X-Amz-Security-Token', this.awsCredentials.sessionToken);
	}

    	/**
	* Sends the request.
     	*/
	send(){
		this.prepareRequest();
        	if (this.method !== 'GET') {
            		this.request.send(JSON.stringify(this.params));
		}
        	else {
            		this.request.send();
        	}
	}

}
