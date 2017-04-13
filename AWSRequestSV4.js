/**
 * Created by Nicola Meneghetti <menego1983@gmail.com>
 * Version 1.0
 *
 * This class has the purpose to create a Canonical Request for Signature Version 4
 * in order to call AWS services with federated identities via HTTP requests.
 * Reference <a href="http://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html">here</a>
 * IMPORTANT: this class uses some of the MooTool library features so take care
 * to change it if and when it will be dismissed or replaced.
 */
class AWSRequestSV4{

	/**
	 * Constructor for the class
	 *
	 * @param {String} method
	 * @param {String} url
	 * @param {Object} params
	 * @param {Function} [callback]
	 */
	constructor(method, url, params, callback) {

		this.method = method.trim().toUpperCase();
		//this.host = this.getHost(url);
		this.URI = this.getCanonicalURI(url);
		this.params = params;
		this.queryString = this.getCanonicalQueryString(params);
		let headers = {
			'Host': this.getHost(url),
			'x-amz-date': this.getISO8601Date()
		};

		if (this.method !== 'GET') {
			headers['Content-Type'] = 'application/json';
			params = JSON.encode(params);
		}

		//MooTool request
		this.request = new Request({
			method: this.method,
			emulation: false,
			url: url,
			headers: headers,
			data: params,
			onSuccess(responseText){

				console.log("success:", responseText);
			},
			onFailure(){

				console.warn("error.");
			}
		});
		this.prepareHeadersEntries();
	}

	/**
	 * Method for getting the signature to include in the canonical request.
	 *
	 * @param {Object} Crypto
	 * @param {String} key
	 * @param {String} dateStamp
	 * @param {String} regionName
	 * @param {String} serviceName
	 * @returns {String} hashed signature
	 */
	getSignatureKey(Crypto, key, dateStamp, regionName, serviceName) {
		var kDate = Crypto.HmacSHA256(dateStamp, "AWS4" + key);
		var kRegion = Crypto.HmacSHA256(regionName, kDate);
		var kService = Crypto.HmacSHA256(serviceName, kRegion);
		return Crypto.HmacSHA256("aws4_request", kService);
	}

	/**
	 * Method to get the request in canonical form once that all fields have beet set.
	 *
	 * @returns {string} canonical request
	 */
	getCanonicalRequest(){
		var canonicalRequest =
			this.method + '\n' +
			this.URI + '\n' +
			this.queryString + '\n' +
			this.getCanonicalHeadres() + '\n' +
			this.getSignedHeaders() + '\n' +
			this.getHashedPayload();

		return canonicalRequest;
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
		if(url.charAt(url.length-1) !== '/'){
			url += '/';
		}
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
	 * Extracts the headers from the request object and normalize them.
	 * The values are saved in the object <i>headers</i> variable.
	 * IMPORTANT: this method assumes that the request object is created with MooTool
	 * so take care to change it if and when you will change framework.
	 *
	 * @param req
	 */
	prepareHeadersEntries(){
		if(typeof this.request.options.headers !== 'undefined'
			&& this.request.options.headers !== null){

			const reqHeaders = this.request.options.headers;
			let objectHeaders = this.headers = [];
			Object.keys(reqHeaders).forEach(function(key) {

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
			console.error("function parameter 'req' does not have headers, is that a MooTool Request object?");
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
		return CryptoJS.SHA256(JSON.encode(this.getCanonicalRequest()))
			.toString()
			.toLowerCase();
	}

	/**
	 * Returns a string representing the current time in ISO8601 format
	 * YYYYMMDD'T'HHMMSS'Z'
	 *
	 * @returns {string}
	 */
	getISO8601Date(){
		var date = new Date();
		let year = date.getFullYear();
		let month = date.getMonth()+1;
		month = (month<10)?('0'+month):month;
		let day = date.getUTCDate();
		let hour = date.getHours();
		hour = (hour<10)?('0'+hour):hour;
		let minutes = date.getMinutes();
		minutes = (minutes<10)?('0'+minutes):minutes;
		let seconds = date.getSeconds();
		seconds = (seconds<10)?('0'+seconds):seconds;
		return '' + year + month + day + 'T' + hour + minutes + seconds + 'Z';
	}

	createStringToSign(){

		let strToSign = 'AWS4-HMAC-SHA256\n' + this.headers['x-amz-date'];

		return strToSign;
	}
}