
/* Dependencies */
var http   = require('http');
var util   = require('util');
var fs     = require('fs');
var url    = require('url');
var crypto = require('crypto');
var path   = require('path');
var jsdom  = require('jsdom');
//var $      = require('jquery');

var DEBUG           = false;
var all_scrap_rules = readScrapSelectors();


/* ################################################################### */

function main() {

	/* Config variables */

	var config = {
		verbose: true,
		curl: {
			"agent"			: 'Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.7 (KHTML, like Gecko) Ubuntu/11.10 Chromium/16.0.912.77 Chrome/16.0.912.77 Safari/535.7',
			"proxy"			: null,
			"use_cache"		: false,
			"cache_dir"		: '/tmp'
		},
		batch: {
			"proxy_file"	: null,
			"batch_file"	: null,
			"agent_file"	: null,
			"threads"		: 1,
			"thread_delay"	: 0
		},
		display: {
			"show_title"		: false,
			"show_domain"		: false,
			"show_keyword"		: false,
			"show_proxy"		: false,
			"show_url_display"	: false,
			"show_description"	: false
		},
		proxies: []
	};


	var gg_params = {
		"start"			: 0,
		"num"			: 10,
		"tld"			: 'fr',
		"hl"			: 'fr',
		"nofilter"		: false,
		"safe"			: 'moderate',	/* *EMPTY*=moderate=images / strict=on=active / off */
		"tbs"			: null
	};


	/* Init variables */
	var keywords             = [];
	var selected_scrap_rules = [];
	

	// Parse command line cmd_args
	var cmd_args = process.argv.splice(2);
	parseArguments(cmd_args, keywords, config, gg_params, all_scrap_rules, selected_scrap_rules);



	// Default mode (display all placements)
	if (selected_scrap_rules.length === 0) {
		//console.log('Error: no placement selected !');
		//process.exit();
		//selected_scrap_rules = ['search', 'ads', 'stuff'];
		selected_scrap_rules = ['search.natural'];
	}



	// Reading proxy file
	if (config.batch.proxy_file) {
		config.proxies = readProxiesFile(config.batch.proxy_file, config);
	}
	if (config.verbose) {
		console.error('Using ' + config.proxies.length + ' proxies');
	}


	// Reading batch file
	if (config.batch.batch_file) {
		keywords = readKeywordsFile(config.batch.batch_file, config);
	}
	if (config.verbose) {
		console.error('Running ' + keywords.length + ' keywords');
		console.error('Running ' + config.batch.threads + ' threads');
	}


	if (keywords.length === 0) {
		usage();
	}


	if (DEBUG) console.log('DEBUG: keywords count => ', keywords.length);
	if (DEBUG) console.log('DEBUG: proxies count => ', config.proxies.length);
	if (DEBUG) console.log('DEBUG: config => ', config);
	if (DEBUG) console.log('DEBUG: selected_scrap_rules => ', selected_scrap_rules);



	var batch = new Batch(keywords, config);
	batch.setConfig(config);
	batch.setSearchParams(gg_params);
	batch.setScrapRules(selected_scrap_rules);
	batch.run();

}



/* ################################################################### */


function Batch(keywords, config) {
	if (DEBUG) console.log('new Batch');
	this.keywords             = keywords;
	this.nb_keywords          = keywords.length;
	this.proxies              = config.proxies;
	this.config               = config || { curl: {}, batch:{}, display:{} };
	this.gg_params            = {};
	this.active_threads       = 0;
	this.selected_scrap_rules = [];
}

Batch.prototype = {
	setConfig: function (config) {
		this.config = config;
	},

	setSearchParams: function (gg_params) {
		this.gg_params = gg_params;
	},

	setScrapRules: function (selected_scrap_rules) {
		this.selected_scrap_rules = selected_scrap_rules;
	},

	run: function () {
		if (DEBUG) console.log('Batch.run');
		for (var i=0; i<this.config.batch.threads; i++) {
			this.runNext();
		}
	},

	runNext: function () {
		if (DEBUG) console.log('Batch.runNext / ', (this.nb_keywords-this.keywords.length) + ' / ' + this.nb_keywords + ' done');
		this.active_threads++;

		// Choose one keyword
		var keyword = this.keywords.shift();
		
		if (! keyword) {
			
			// end of keywords list
			this.active_threads--;
			if (this.active_threads === 0) {
				// Batch completed
				return this.batchComplete();
			}
			return;	// waiting for others threads'end
		}


		// Choose one proxy
		var proxy = null;
		if (this.proxies.length) {
			var nb_proxies = this.proxies.length;
			proxy = this.proxies[ Math.floor((Math.random()*nb_proxies)) ];
		}


		var _batch = this;
		var keyword_run = new KeywordRun(keyword, proxy);
		keyword_run.setConfig(this.config);
		keyword_run.setSearchParams(this.gg_params);
		keyword_run.setScrapRules(this.selected_scrap_rules);
		
		keyword_run.onComplete = function () {
			var args  = arguments;
			var delay = _batch.keywords.length ? _batch.config.batch.thread_delay : 0;
			return setTimeout(function () {_batch.runNext.apply(_batch, args);}, delay);
		};

		keyword_run.run(this.run);

	},

	batchComplete: function () {
		if (DEBUG) console.log('Batch.batchComplete');
	}
};


/* ################################################################### */


function KeywordRun(keyword, proxy) {
	if (DEBUG) console.log('new KeywordRun');

	this.keyword              = keyword;
	this.proxy                = proxy;
	this.config               = {};
	this.selected_scrap_rules = [];
	this.onComplete           = function () {};
}

KeywordRun.prototype = {
	setConfig: function (config) {
		this.config = config;
	},

	setSearchParams: function (gg_params) {
		this.gg_params = gg_params;
	},

	setScrapRules: function (selected_scrap_rules) {
		this.selected_scrap_rules = selected_scrap_rules;
	},

	run: function () {
		if (DEBUG) console.log('KeywordRun.run');
		this.fetch();
	},

	fetch: function () {
		var _keyword_run = this;

		if (DEBUG) console.log('KeywordRun.fetch');
		var page_url = getGoogleWebSearchUrl(this.gg_params, this.keyword);

		var options  = getCurlOptionsFromUrl(page_url, this.config, this.proxy);

		var url_md5    = crypto.createHash('md5').update(page_url).digest("hex");
		var cache_file = this.config.curl.cache_dir + '/serp_gg_' + url_md5 + '.html';

		if (this.config.verbose) {
			console.error('Remote URL: ' + page_url);
		}

		var html = '';
		if (this.config.curl.use_cache) {
			// Read content from local cache
			if (FsExistsSync(cache_file)) {
				if (this.config.verbose) {
					console.error('Reading cache: file://' + cache_file);
				}
				html = fs.readFileSync(cache_file).toString();
				return this.parse(html);
			}
		}


		// Get remote page
		http.get(options, function(res) {
			res.on('data', function(data) {
				html += data;
			}).on('end', function() {
				if ( _keyword_run.config.curl.use_cache) {
					// Write local cache
					fs.writeFile(cache_file, '<!-- ORIGIN_URL: ' + page_url + ' -->' + html, function (err) {
						if (_keyword_run.config.verbose) {
							console.error('Writing cache: file://' + cache_file);
						}
						if (err) throw err;
					});
				}
				// Execute callback function
				_keyword_run.parse(html);
			});
		});
	},

	parse: function (html) {
		var _keyword_run = this;

		if (DEBUG) console.log('DEBUG: parsePageContent => ', html.length, ' bytes to parse');

		var jquery_path = path.dirname(process.argv[1]) + '/js_modules/jquery.js';
		if (! FsExistsSync(jquery_path)) {
			jquery_path = 'http://code.jquery.com/jquery-1.4.2.min.js';
		}

		var window = jsdom.jsdom(html).createWindow();
		jsdom.jQueryify(window, jquery_path, function() {

			var $ = window.$;

			if (DEBUG) console.log('jQueryifyied');

			var $html          = $(html);
			var display_buffer = [];

			// FOR EACH RULE (SEARCH, ADS, ...)

			for (var i=0, l=_keyword_run.selected_scrap_rules.length; i<l; i++) {	// for each first level rule...
				var rule_name = _keyword_run.selected_scrap_rules[i];
				var rule_placements;

				if (rule_name.indexOf('.') === -1) {
					// Take all the rule
					rule_placements = all_scrap_rules[rule_name];

				}else{
					// Take a sub type of rule
					var parts                                = rule_name.split('.');
					rule_name                                = parts[0];
					var tmp_rule_placement_name              = parts[1];
					rule_placements                          = {};
					rule_placements[tmp_rule_placement_name] = all_scrap_rules[rule_name][tmp_rule_placement_name];
				}

				// FOR EACH PLACEMENT OF THE RULE
				var rule_placements_names = Object.keys(rule_placements);
				for (var j=0, m=rule_placements_names.length; j<m; j++) {	// for each second level rule...
					var rule_placement_name = rule_placements_names[j];
					var rule_placement      = rule_placements[rule_placement_name];
					var jpaths              = rule_placement['jpaths'];
					var jpath               = jpaths.join(',');
					var pattern_results     = $html.find(jpath);
					var nb_results          = pattern_results.length;
					if (nb_results === 0) {
						continue;
					}
					if (DEBUG) console.log(rule_name + ' -> ' + rule_placement_name + ' -> ' + nb_results);

					pattern_results.each(function (n, item) {
						var tmp_buffer = parseResultItemGoogle(n, item, rule_name, rule_placement_name, $);
						if (tmp_buffer) {
							for (var i=0, l=tmp_buffer.length; i<l; i++) {
								display_buffer.push(tmp_buffer[i]);
							}
						}
					});

				}
			}


			displayResults(display_buffer);

			if (typeof(_keyword_run.onComplete) == 'function') {
				//console.log('NEXT ??');
				_keyword_run.onComplete();
			}else{
				console.log('BYE BYE');
				process.exit(0);	// is not implicit on Windows
			}

			
		});





		function parseResultItemGoogle(n, item, result_type_name, result_type_placement_name, $) {
			//console.log('parseResultItemGoogle', n, result_type_name, result_type_placement_name);

			var $item         = $(item);
			var item_tag_name = item.tagName;
			var item_infos    = parseResultItemInfosGoogle(result_type_name, result_type_placement_name, $item);
			var link_anchor   = $item.text();

			if (item_infos === false || item_infos.length === 0) {
				return;
			}
			
			//console.log($item.parent().next().find('span.st').html());process.exit();

			// Display result
			var display_tmp_buffer = [];
			var position           = n+1;
			var item_buffer        = [];

			var link   = item_infos[0] + '';
			var parts  = link.split('/');
			var domain = (parts[2] === undefined) ? '' : parts[2];

			var description        = '';
			var url_display        = '';

			if (result_type_name + '.' + result_type_placement_name == 'search.natural') {
				description = $item.parent().next().find('span.st').text();
				url_display = $item.parent().next().find('div.kv > cite').text();

			}else if (result_type_name == 'ads') {
				description = $item.parent().nextAll('span.ac').text();
				url_display = $item.parent().nextAll().find('div.kv > cite').text();
				domain		= url_display.split('/')[0];
			}

			// column "placement"
			item_buffer.push(result_type_name + '.' + result_type_placement_name);

			// column "keyword"
			if (_keyword_run.config.display.show_keyword) {
				item_buffer.push(_keyword_run.keyword);
			}

			// column "proxy"
			if (_keyword_run.config.display.show_proxy) {
				item_buffer.push(_keyword_run.proxy || '-');
			}

			// column "position"
			item_buffer.push(position);

			// column "domain"
			if (_keyword_run.config.display.show_domain) {
				item_buffer.push(domain);
			}

			// column "link"
			item_buffer.push(item_infos[0]);

			// column url_display
			if (_keyword_run.config.display.show_url_display) {
				item_buffer.push(url_display);
			}

			// column description
			if (_keyword_run.config.display.show_description) {
				item_buffer.push(description);
			}

			// column "title"
			if (_keyword_run.config.display.show_title) {
				item_buffer.push(item_infos[1]);
			}

			display_tmp_buffer.push(item_buffer.join("\t"));


			if (result_type_name == 'search' && result_type_placement_name == 'main') {
				// Sitelinks
				var $div_sitelinks = $item.closest('li.g').find('>table div.vsc>span.tl>h3.r>a');

				$div_sitelinks.each(function (n, sitelink) {
					var $sitelink     = $(sitelink);
					var sitelink_url  = $(sitelink).attr('href');
					var sitelink_text = $(sitelink).text();
					sitelink_url      = "[SITELINK] " + sitelink_url;
					var item_buffer   = [];

					// column "placement"
					item_buffer.push(result_type_name + '.' + result_type_placement_name);


					// column "keyword"
					if (_keyword_run.config.display.show_keyword) {
						item_buffer.push(_keyword_run.keyword);
					}

					// column "proxy"
					if (_keyword_run.config.display.show_proxy) {
						item_buffer.push(_keyword_run.proxy || '-');
					}

					// column "position"
					item_buffer.push(position + '-' + (n+1));

					// column "domain"
					if (_keyword_run.config.display.show_domain) {
						item_buffer.push(domain);
					}

					// column "link"
					item_buffer.push(sitelink_url);

					// column url_display
					if (_keyword_run.config.display.show_url_display) {
						item_buffer.push('');
					}

					// column description
					if (_keyword_run.config.display.show_description) {
						item_buffer.push('');
					}

					// column "title"
					if (_keyword_run.config.display.show_title) {
						item_buffer.push(sitelink_text);
					}

					display_tmp_buffer.push(item_buffer.join("\t"));
				});
			}

			return display_tmp_buffer;
		}

		function parseResultItemInfosGoogle(result_type_name, result_type_placement_name, $item) {
			//console.log('parseResultItemInfosGoogle', result_type_name, result_type_placement_name);

			var univ_search_patterns = {
				'images'	: '&tbm=isch&',
				'news'		: '&tbm=nws&',
				'videos'	: '&tbm=vid&',
				'maps'		: '/maps?',
				'products'	: '&tbm=shop&',
				'books'		: '&tbm=bks&',
				'places'	: '&tbm=plcs&'
			};

			var item_text = $item.text();
			var item_url  = $item.attr('href');
			var _url      = (item_url === undefined) ? null : url.parse(item_url, true);


			function getUniversalSearchType(item_url) {
				//console.log('getUniversalSearchType');
				var univ_search_type = 'unknown';

				var univ_search_names = Object.keys(univ_search_patterns);
				for (var i=0, l=univ_search_names.length; i<l; i++) {
					var univ_search_name = univ_search_names[i];
					if (item_url.indexOf(univ_search_patterns[univ_search_name]) > -1) {
						univ_search_type = univ_search_name;
						break;
					}
				}

				return univ_search_type;
			}

			if (result_type_name == 'search') {
				// natural result
				var extra_data = $item.closest('div.vsc').attr('data-extra');

				if (result_type_placement_name == 'count') {
					// result count
					var item_tmp = item_text;
					item_tmp     = item_tmp.split('(')[0];
					item_tmp     = item_tmp.split('（')[0];		//  special char => （ ==> %EF%BC%88 (used for example by google.co.jp)
					item_tmp     = item_tmp.replace(/[^0-9]/g, "");
					var item_int = parseInt(item_tmp, 10);
					return [item_int, item_text];

				}else if (item_url.indexOf('/search') === 0) {
					// universal search
					var univ_search_type = getUniversalSearchType(item_url);
					return ["[UNIVERSAL SEARCH " + univ_search_type + "]", item_text];

				}else if (item_url.indexOf('/url') === 0) {
					if (_url.query.url !== undefined) {
						// onebox	// ex: manchester united (1st result)
						return ["[ONEBOX search] " + _url.query.url, item_text];
					}

				}else if (extra_data !== '') {
					if (result_type_placement_name == 'onebox') {
						//return false;	// ok for 'arsenal' but not for 'billet avion agadir'
					}

					// universal search places
					return ["[UNIVERSAL SEARCH PLACES] " + item_url, item_text];

				}

			}else if (result_type_name == 'stuff') {
				if (result_type_placement_name == 'album_search_bottom' && item_url.indexOf('/search') === 0) {
					// album_search
					return [item_text, item_text];

				}else if (result_type_placement_name == 'maps_right') {
					// onebox maps
					return ['[ONEBOX RIGHT MAPS]', item_text];

				}else if (result_type_placement_name == 'related_bottom' && item_url.indexOf('/search') === 0) {
					// recherche associee
					return [item_text, item_text];

				}else if (result_type_placement_name == 'top' && item_url.indexOf('/movies') === 0) {
					return ["[ONEBOX CINEMA]", item_text];

				}else if (result_type_placement_name == 'top' && item_url.indexOf('/url') === 0) {
					// onebox // ex: ILD
					if (_url.query.url === undefined) {
						return ["[ONEBOX stuff] " + _url.query.q, item_text];
					}
				}else if (item_url === '') {
					return [item_text, item_text];	// ex: pi
				}

			}else if (result_type_name === 'ads') {
				if (item_url.indexOf('/aclk?') === 0) {
					// ads
					return [_url.query.adurl, item_text];
				}

			}

			return [item_url, item_text];
		}


		function displayResults(display_buffer) {
			console.log(display_buffer.join("\n"));
		}


		
	}
};

/* ################################################################### */





function parseArguments(cmd_args, keywords, config, gg_params, all_scrap_rules, selected_scrap_rules) {
	for (var i=0, l=cmd_args.length; i<l; i++) {
		var arg0 = cmd_args[i];
		var arg0_short	= arg0.split('.')[0];
		var arg0_option	= (arg0.length <= 1) ? null : arg0.split('.')[1];
		var arg1 = (l>i+1) ? cmd_args[i+1] : null;

		switch (arg0_short) {
			case '-fake':
			case '-simulate':
				config.curl.simulate = true;
				break;
			case '-h':
			case '-help':
				usage(0);
				break;
			case '-q':
			case '-quiet':
				config.verbose = false;
				break;
			case '-types':
				var rules_names = Object.keys(all_scrap_rules);
				for (var n=0, m=rules_names.length; n<m; n++) {	// for each first level rule...
					var rule_name           = rules_names[n];
					var sub_all_scrap_rules = all_scrap_rules[rule_name];
					var buffer              = [];
					var sub_rules_names     = Object.keys(sub_all_scrap_rules);
					for (var j=0, k=sub_rules_names.length; j<k; j++) {	// for each second level rule...
						var sub_rule_name = sub_rules_names[j];
						buffer.push(sub_rule_name);
					}
					console.log(' -' + rule_name + " => " + buffer.join(' '));
				}
				process.exit(0);
				break;
			case '-all':
				//selected_scrap_rules = ['search', 'ads', 'stuff'];
				selected_scrap_rules.push('search');
				selected_scrap_rules.push('ads');
				selected_scrap_rules.push('stuff');
				break;
			case '-search':
			case '-ads':
			case '-stuff':
				if (arg0_option) {
					selected_scrap_rules.push(arg0.substr(1));
				}else{
					selected_scrap_rules.push(arg0_short.substr(1));
				}
				break;
			case '-cache':
				config.curl.use_cache = true;
				break;
			case '-title':
				config.display.show_title = true;
				break;
			case '-domain':
				config.display.show_domain = true;
				break;
			case '-showall':
					config.display.show_proxy = true;
					config.display.show_url_display = true;
					config.display.show_description = true;
					config.display.show_domain = true;
					config.display.show_title = true;
					config.display.show_keyword = true;
				break;
			case '-showproxy':
				config.display.show_proxy = true;
				break;
			case '-showurl':
					config.display.show_url_display = true;
				break;
			case '-showdescription':
			case '-showdesc':
			case '-showsnippet':
					config.display.show_description = true;
				break;
			case '-kw':
			case '-keyword':
				config.display.show_keyword = true;
				break;
			case '-count':
				selected_scrap_rules.push('search.count');
				break;
			case '-nofilter':
				gg_params.nofilter = true;
				break;
			case '-debug':
				DEBUG = true;
				break;
			case '-safe':
				gg_params.safe = arg1;
				i++;
				break;
			case '-num':
				if (! isNaN(arg1)) {
					gg_params.num = arg1;
				}
				i++;
				break;
			case '-start':
				if (! isNaN(arg1)) {
					gg_params.start = arg1;
				}
				i++;
				break;
			case '-tld':
				gg_params.tld = arg1;
				i++;
				break;
			case '-lang':
			case '-hl':
				gg_params.hl = arg1;
				i++;
				break;
			case '-agent':
				config.curl.agent = arg1;
				i++;
				break;
			case '-proxy':
				config.proxies = [arg1];

				i++;
				break;
			case '-cachedir':
				config.curl.cache_dir = arg1;
				i++;
				break;
			case '-threads':
				config.batch.threads = arg1;
				i++;
				break;
			case '-delay':
				config.batch.thread_delay = arg1;
				i++;
				break;
			case '-proxyfile':
				config.batch.proxy_file = arg1;
				i++;
				break;
			case '-batchfile':
				config.batch.batch_file     = arg1;
				config.display.show_proxy   = true;
				config.display.show_keyword = true;
				i++;
				break;
			case '-tbs':
			case '-date':
				gg_params.tbs = arg1;
				i++;
				// TODO
				// &tbs=qdr:h
				// &tbs=qdr:d
				// &tbs=qdr:w
				// &tbs=qdr:m
				// &tbs=qdr:y
				break;
			default:
				if (keywords.length === 0 && arg0.indexOf('-') !== 0) {
					keywords.push(arg0);
				}else if (keywords.length == 1) {
					keywords[0] += ' ' + arg0;
				}else{
					console.error('invalid parameter: ' + arg0);
				}
				break;
		}
	}

}



function getGoogleWebSearchUrl(gg_params, keyword) {
	// tld, hl, q, start, num, nofilter, safe

	var gg_url = "http://www.google." + gg_params.tld + '/search';
	gg_url += '?hl=' + gg_params.hl;
	gg_url += '&q=' + encodeURIComponent(keyword);
	if (gg_params.num !== undefined && !isNaN(gg_params.num))		gg_url += '&complete=0&num=' + gg_params.num;
	if (gg_params.start !== undefined && !isNaN(gg_params.start))	gg_url += '&start=' + gg_params.start;
	if (gg_params.nofilter)											gg_url += '&filter=0';
	if (gg_params.safe !== '')										gg_url += '&safe=' + gg_params.safe;
	if (gg_params.tbs !== null)										gg_url += '&tbs=qdr:' + gg_params.tbs;

	return gg_url;
}



function getCurlOptionsFromUrl(curl_url, config, proxy) {

	var http_auth  = '';	// TODO if needed...
	var proxy_auth = '';

	if (proxy && proxy.indexOf('http://') === 0) {
		curl_url = proxy + encodeURIComponent(curl_url);
		if (config.verbose) {
			console.error('Using proxy : ' + proxy);
		}
		proxy = null;
	}

	var _url       = url.parse(curl_url);


	if (proxy) {
		var parts           = proxy.split('@');
		var proxy_host_port = parts[parts.length-1];
		var proxy_array     = proxy_host_port.split(':');

		if (proxy_array !== undefined && proxy_array.length === 2) {
			// Use proxy
			if (config.verbose) {
				console.error('Using proxy : ' + proxy_host_port);
			}
			_url = {
				host		: proxy_array[0],
				port		: proxy_array[1],
				pathname	: curl_url,
				search		: ''
			};
			proxy_auth = (parts.length > 1) ? ('Basic ' + new Buffer(parts[0]).toString('base64')) : '';
		}
	}


	var options = {
		host: _url.host,
		port: _url.port || 80,
		path: _url.pathname + (_url.search === undefined ? '' : _url.search),
		headers: {
			"User-Agent"			: config.curl.agent,
			"Proxy-Authorization"	: proxy_auth,
			"Authorization"			: http_auth
		}
	};

	return options;
}



function FsExistsSync() {
	var fn = (fs.existsSync !== undefined) ? fs.existsSync : path.existsSync;
	return fn.apply(null, arguments);
}

function readProxiesFile(proxy_file, config) {
	var proxies = [];

	if (config.verbose) {
		console.error('Using proxy file : ' + proxy_file);
	}

	if (FsExistsSync(proxy_file)) {
		//console.error('Reading file://' + proxy_file);
		var proxy_contents = fs.readFileSync(proxy_file).toString();
		var lines          = proxy_contents.split("\n");
		var nb_lines       = lines.length;
		for (var i=0; i<nb_lines; i++) {
			if (lines[i].trim() === '') continue;
			proxies.push(lines[i]);
		}
	}else{
		console.error('Invalid proxy file');
		process.exit(0);
	}
	return proxies;
}


function readKeywordsFile(batch_file, config) {
	var keywords = [];

	if (config.verbose) {
		console.error('Using batch file : ' + batch_file);
	}

	if (FsExistsSync(batch_file)) {
		//console.error('Reading file://' + batch_file);
		var kw_contents = fs.readFileSync(batch_file).toString();
		var lines       = kw_contents.split("\n");
		var nb_lines    = lines.length;
		for (var i=0; i<nb_lines; i++) {
			if (lines[i].trim() === '') continue;
			keywords.push(lines[i]);
		}
	}else{
		console.error('Invalid batch file');
		process.exit(0);
	}
	return keywords;
}



function readScrapSelectors() {
	return {
		'search': {
			'onebox' : {
				'jpaths' : [
					'div#search ol#rso li>div>div.obcontainer>div>h3.r>a',		/* onebox ex: "manchester united" */
					'div#search ol#rso li>div>div.ibk>h3.r>a',					/* onebox maps. ex: 12 rue des plantes paris */
					'div#search ol#rso li>div>div.obcontainer>div>h3'			/* onebox billets avion. ex: billet avion agadir */
				]
			},
			'natural' : {
				'jpaths': [
					'div#search ol#rso li>div.vsc>h3.r>a',						/* natural results */
					'div#search ol#rso li>h3.r>a',								/* universal search */
					'div#search ol#rso li>div.vsc>div>table h3.r>a'				/* videos */
				]
			},
			'count':	{
				'jpaths'	: ['#resultStats']
			}
		},
		'ads': {
			'top': {
				'jpaths':	[
					/* '#tads>ol>li>h3>a', */
					'#tads>ol li>div.vsc>h3>a'		/* ex: jupe rouge */
				]
			},
			'right'	: {
				'jpaths':	[
					'div#rhs_block ol>li>div:nth-child(1)>div>a',		/* adwords google-product with image */
					'div#rhs_block ol li>h3>a'							/* adwords classic */
				]
			},
			'bottom'	: {
				'jpaths':	[
					'#tadsb>ol li>div.vsc>h3>a'			/* ex: jupe twenga */
				]
			}
		},
		'stuff'	: {
			'top'		: {
				'jpaths': [
					'#topstuff>div>div>h2.r>a',							/* bourse. ex: ILD */
					'#search>#ires>ol>li.g div.obcontainer>div>h3.r',	/* meteo. ex: temps a paris */
					'#topstuff>table td>h2.r',							/* maths. ex: pi */
					'#topstuff>div.obp>div.obcontainer>div>div>a'		/* horaire de cinema. ex: projet x */
				]
			},
			'bottom'	: {
				'jpaths': ['#botstuff>div>div>h2.r>a']					/* some examples ? */
			},
			"related_bottom": {
				'jpaths': ['#botstuff>div#brs>div.brs_col>p>a']			/* recherches associees */
			},
			"google+_right": {
				'jpaths': ['#rhs_block table.ts div.gl>a']				/* google+. ex: mon adresse ip */
			},
			"album_search_bottom": {
				'jpaths': ['div#search ol#rso li.g>div>div>a:nth-child(2)']		/* albums music. ex: rihanna*/
			},
			"maps_right": {
				'jpaths': ['div#rhs_block div.rhsvw span>span>a.fl']			/* maps, on the right column ex: reston cosmetic dentist */
			}
		}
	};
}




/* ####################### */

function usage(rc) {

	var _usage = [
		'NodeJS Google search - version 0.1',
		'',
		'Usage: $ node ' + path.basename(process.argv[1]) + ' [<options>] <keyword>',
		'       $ node ' + path.basename(process.argv[1]) + ' [<options>] -batchfile /tmp/keywords_list.txt',
		'',
		'  Placement options :',
		'	-all			: display all (search+count+ads+stuff)			',
		'	-search			: display search results (natural + onebox + count)',
		'	-search.natural		: display search results				[default display mode]',
		'	-search.count | -count	: display results count',
		'	-ads			: display ads results',
		'	-ads.top		: display ads results (only top results)',
		'	-ads.right		: display ads results (only right results)',
		'	-stuff			: display other stuff results',
		'	-stuff.related_bottom	: display suggestions',
		'',
		'  Columns options :',
		'	-title			: display links title					default: not displayed',
		'	-kw			: display request keyword				default: not displayed',
		'	-domain			: display links domain					default: not displayed',
		'	-showproxy		: display used proxy					default: not displayed',
		'	-showdesc		: display description/snippet				default: not displayed',
		'	-showurl		: display displayed green url				default: not displayed',
		'	-showall		: display all columns',
		'',
		'  Google options :',
		'	-nofilter		: disable duplicate filter search			default: filter activated',
		'	-num <int>		: nb of results						default: 10',
		'	-start <int>		: results start offset					default: 0',
		'	-tld <string>		: google country extension				default: fr',
		'	-hl | -lang <string>	: google language parameter				default: fr',
		'	-safe <string>		: change safe level (off,moderate,strict)		default: moderate',
		'	-date <string>		: filter results on last hour(h) / day(d) / week(w) / year(y) ',
		'',
		'  Connection options :',
		'	-cache			: use local fs cache					default: no cache',
		'	-cache_dir		: temp folder to store fetched pages			default: /tmp',
		'	-agent <string>		: change user agent					default: Mozilla/5.0 (X11; Linux i686)...',
		'	-proxy <string>		: use proxy						format: "hostname:port" or "user:password@hostname:port"',
		'	-proxyfile <string>	: use proxy file					file format: one proxy per line',
		'',
		' Batch mode :',
		'	-batchfile <string>	: keywords file						file format: one keyword per line',
		'	-threads <int>		: nb of threads						default: 1',
		'	-delay <int>		: delay between each request (by thread) in ms.		default: 0',
		'',
		'  Misc options :',
		'	-q | -quiet		: disable notice messages				default: false',
		'	-types			: display placements types (and quit)',
		'	-fake			: display google url (and quit)',
		'	-h | -help		: display this message'
	];
	console.log(_usage.join("\n"));

	process.exit(rc);
}



/* ################################################################### */

main();


