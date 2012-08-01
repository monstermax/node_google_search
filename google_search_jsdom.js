
/* Dependencies */
var http   = require('http');
var util   = require('util');
var fs     = require('fs');
var url    = require('url');
var crypto = require('crypto');
var path   = require('path');
var jsdom  = require('jsdom');


/* Config variables */

var curl_config = {
	"agent"			: 'Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.7 (KHTML, like Gecko) Ubuntu/11.10 Chromium/16.0.912.77 Chrome/16.0.912.77 Safari/535.7',
	"use_cache"		: false,
	"verbose"		: true,
	"simulate"		: false
};

var batch_config = {
	"proxy_file"	: null,
	"batch_file"	: null
};


var all_scrap_rules = readScrapSelectors();

var display_config = {
	"show_title"	: false,
	"show_domain"	: false,
	"show_keyword"	: false,
	"show_proxy"	: false
};

var gg_params = {
	"start"			: 0,
	"num"			: 10,
	"tld"			: 'fr',
	"hl"			: 'fr',
	"nofilter"		: false,
	"safe"			: 'moderate'	/* *EMPTY*=moderate=images / strict=on=active / off */
};


/* Init variables */
var keywords             = [];
var proxies              = [];
var selected_scrap_rules = [];



// Parse command line cmd_args
var cmd_args = process.argv.splice(2);
parseArguments(cmd_args);
//console.log('DEBUG: keywords => ', keywords);
//console.log('DEBUG: proxies => ', proxies);
//console.log('DEBUG: curl_config => ', curl_config);
//console.log('DEBUG: batch_config => ', batch_config);
//console.log('DEBUG: display_config => ', display_config);


// Default mode (display all placements)
if (selected_scrap_rules.length === 0) {
	//selected_scrap_rules = ['search', 'ads', 'stuff'];
	selected_scrap_rules = ['search.natural'];
}
//console.log('DEBUG: selected_scrap_rules => ', selected_scrap_rules);



// Reading proxy file
if (batch_config.proxy_file) {
	proxies = readProxiesFile(batch_config.proxy_file);
}
console.error('Using ' + proxies.length + ' proxies');

// Reading batch file
if (batch_config.batch_file) {
	keywords = readKeywordsFile(batch_config.batch_file);
}
console.error('Running ' + keywords.length + ' keywords');

if (keywords.length === 0) {
	usage();
}




function runNextKeyword() {
	//console.log("DEBUG: shift keyword", keywords);

	// Choose one keyword
	var keyword = keywords.shift();
	if (! keyword) {
		// end of keywords list
		return finalyzeProcess();
	}

	// Choose one proxy
	var proxy = null;
	if (proxies.length) {
		var nb_proxies = proxies.length;
		proxy = proxies[ Math.floor((Math.random()*nb_proxies)) ];
	}

	// Process google query
	var gg_url = getGoogleWebSearchUrl(gg_params, keyword);

	if (curl_config.simulate) {
		console.log(gg_url);
		process.exit(0);
	}

	
	// Process google query
	getPageContent(keyword, gg_url, curl_config, proxy, fetchPageCallback);
}


function fetchPageCallback(keyword, content) {
	// Parse google result content
	parsePageContent(keyword, content, all_scrap_rules, selected_scrap_rules, parseResultItemGoogle, parsePageCallback);
}

function parsePageCallback() {
	runNextKeyword();
}


function finalyzeProcess() {
	// End of all keywords
	console.error(' => All keywords done.');
	process.exit(0);
}


runNextKeyword();		// RUN !!!

return;


/* ####################### */

function usage(rc) {

	var _usage = [
		'NodeJS Google search - version 0.1',
		'',
		'Usage: $ node ' + path.basename(process.argv[1]) + ' [<options>] <keyword>',
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
		'',
		'  Google options :',
		'	-nofilter		: disable duplicate filter search			default: filter activated',
		'	-num <int>		: nb of results						default: 10',
		'	-start <int>		: results start offset					default: 0',
		'	-tld <string>		: google country extension				default: fr',
		'	-hl | -lang <string>	: google language parameter				default: fr',
		'	-safe <string>		: change safe level (off,moderate,strict)		default: moderate',
		'',
		'  Connection options :',
		'	-cache			: use local fs cache					default: no cache',
		'	-agent <string>		: change user agent					default: see in code...',
		'	-proxy <string>		: use proxy			(format: "hostname:port" or "user:password@hostname:port")',
		'	-proxyfile <string>	: use proxy file		(file format: one proxy per line)',
		'',
		' Batch mode :',
		'	-batchfile <string>	: keywords file			(file format: one keyword per line)',
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

/* ####################### */




function parseArguments(cmd_args) {
	for (var i=0, l=cmd_args.length; i<l; i++) {
		var arg0 = cmd_args[i];
		var arg0_short	= arg0.split('.')[0];
		var arg0_option	= (arg0.length <= 1) ? null : arg0.split('.')[1];
		var arg1 = (l>i+1) ? cmd_args[i+1] : null;

		switch (arg0_short) {
			case '-fake':
			case '-simulate':
				curl_config.simulate = true;
				break;
			case '-h':
			case '-help':
				usage(0);
				break;
			case '-q':
			case '-quiet':
				curl_config.verbose = false;
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
				selected_scrap_rules = ['search', 'ads', 'stuff'];
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
				curl_config.use_cache = true;
				break;
			case '-title':
				display_config.show_title = true;
				break;
			case '-domain':
				display_config.show_domain = true;
				break;
			case '-kw':
			case '-keyword':
				display_config.show_keyword = true;
				break;
			case '-count':
				selected_scrap_rules.push('search.count');
				break;
			case '-nofilter':
				gg_params.nofilter = true;
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
				curl_config.agent = arg1;
				i++;
				break;
			case '-proxy':
				proxies = [arg1];
				i++;
				break;
			case '-proxyfile':
				batch_config.proxy_file = arg1;
				i++;
				break;
			case '-batchfile':
				batch_config.batch_file     = arg1;
				display_config.show_proxy   = true;
				display_config.show_keyword = true;
				i++;
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



function getCurlOptionsFromUrl(curl_url, curl_config, proxy) {

	var _url       = url.parse(curl_url);
	var http_auth  = '';	// TODO if needed...
	var proxy_auth = '';

	if (proxy) {
		var parts           = proxy.split('@');
		var proxy_host_port = parts[parts.length-1];
		var proxy_array     = proxy_host_port.split(':');

		if (proxy_array !== undefined && proxy_array.length === 2) {
			// Use proxy
			if (curl_config.verbose) {
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
			"User-Agent"			: curl_config.agent,
			"Proxy-Authorization"	: proxy_auth,
			"Authorization"			: http_auth
		}
	};

	return options;
}


function getPageContent(keyword, page_url, curl_config, proxy, onFetchComplete) {
	var options = getCurlOptionsFromUrl(page_url, curl_config, proxy);

	//var page_url = 'http://' + options.host + options.path;
	var url_md5    = crypto.createHash('md5').update(page_url).digest("hex");
	var cache_file = '/tmp/serp_gg_' + url_md5 + '.html';

	if (curl_config.verbose) {
		console.error('Remote URL: ' + page_url);
	}

	var html = '';
	if (curl_config.use_cache) {
		// Read content from local cache
		if (FsExistsSync(cache_file)) {
			if (curl_config.verbose) {
				console.error('Reading cache: file://' + cache_file);
			}
			html = fs.readFileSync(cache_file).toString();
			return onFetchComplete(keyword, html);
		}
	}

	// Get remote page
	http.get(options, function(res) {
		res.on('data', function(data) {
			html += data;
		}).on('end', function() {
			if ( curl_config.use_cache) {
				// Write local cache
				fs.writeFile(cache_file, '<!-- ORIGIN_URL: ' + page_url + ' -->' + html, function (err) {
					if (curl_config.verbose) {
						console.error('Writing cache: file://' + cache_file);
					}
					if (err) throw err;
				});
			}
			// Execute callback function
			onFetchComplete(keyword, html);
		});
	});

}



function parsePageContent(keyword, html, all_scrap_rules, selected_scrap_rules, onResultItemCallback, onParseComplete) {

	var window = jsdom.jsdom(html).createWindow();
	jsdom.jQueryify(window, 'jquery-1.4.2.min.js', function() {
		var $ = window.$;

		var $html          = $(html);
		var display_buffer = [];

		// FOR EACH RULE (SEARCH, ADS, ...)
		
		for (var i=0, l=selected_scrap_rules.length; i<l; i++) {	// for each first level rule...
			var rule_name = selected_scrap_rules[i];
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
				//console.log(rule_name + ' -> ' + rule_placement_name + ' -> ' + nb_results);

				pattern_results.each(function (n, item) {
					var tmp_buffer = onResultItemCallback(keyword, n, item, rule_name, rule_placement_name, $);
					if (tmp_buffer) {
						for (var i=0, l=tmp_buffer.length; i<l; i++) {
							display_buffer.push(tmp_buffer[i]);
						}
					}
				});
			}
		}

		displayResults(display_buffer);

		if (typeof(onParseComplete) == 'function') {
			onParseComplete();
		}else{
			process.exit(0);	// is not implicit on Windows
		}
		
	});

}

/* ####################### SPECIFIC GOOGLE ## */


function getGoogleWebSearchUrl(gg_params, keyword) {
	// tld, hl, q, start, num, nofilter, safe

	var gg_url = "http://www.google." + gg_params.tld + '/search';
	gg_url += '?hl=' + gg_params.hl;
	gg_url += '&q=' + encodeURIComponent(keyword);
	if (gg_params.num !== undefined && !isNaN(gg_params.num))		gg_url += '&complete=0&num=' + gg_params.num;
	if (gg_params.start !== undefined && !isNaN(gg_params.start))	gg_url += '&start=' + gg_params.start;
	if (gg_params.nofilter)											gg_url += '&filter=0';
	if (gg_params.safe !== '')										gg_url += '&safe=' + gg_params.safe;

	return gg_url;
}


function parseResultItemGoogle(keyword, n, item, result_type_name, result_type_placement_name, $) {

	var $item         = $(item);
	var item_tag_name = item.tagName;
	var item_infos    = parseResultItemInfosGoogle(result_type_name, result_type_placement_name, $item);
	var link_anchor   = $item.text();

	if (item_infos === false || item_infos.length === 0) {
		return;
	}


	// Display result
	var display_tmp_buffer = [];
	var position           = n+1;
	var item_buffer        = [];

	// column "placement"
	item_buffer.push(result_type_name + '.' + result_type_placement_name);

	// column "keyword"
	if (display_config.show_keyword) {
		item_buffer.push(keyword);
	}

	// column "position"
	item_buffer.push(position);

	// column "link"
	item_buffer.push(item_infos[0]);

	// column "domain"
	if (display_config.show_domain) {
		var link   = item_infos[0] + '';
		var parts  = link.split('/');
		var domain = (parts[2] === undefined) ? '' : parts[2];
		item_buffer.push(domain);
	}

	// column "title"
	if (display_config.show_title) {
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
			var sitelink_url  = "[SITELINK] " + sitelink_url;
			var item_buffer   = [];

			// column "placement"
			item_buffer.push(result_type_name + '.' + result_type_placement_name);


			// column "keyword"
			if (display_config.show_keyword) {
				item_buffer.push(gg_params.keyword);
			}

			// column "position"
			item_buffer.push(position + '-' + (n+1));

			// column "link"
			item_buffer.push(sitelink_url);

			// column "domain"
			if (display_config.show_domain) {
				item_buffer.push(domain);
			}

			// column "title"
			if (display_config.show_title) {
				item_buffer.push(sitelink_text);
			}

			display_tmp_buffer.push(item_buffer.join("\t"));
		});
	}

	return display_tmp_buffer;
}

function parseResultItemInfosGoogle(result_type_name, result_type_placement_name, $item) {

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

function FsExistsSync() {
	var fn = (fs.existsSync !== undefined) ? fs.existsSync : path.existsSync;
	return fn.apply(null, arguments);
}

function readProxiesFile(proxy_file) {
	var proxies = [];

	if (curl_config.verbose) {
		console.error('Using proxy file : ' + proxy_file);
	}

	if (FsExistsSync(proxy_file)) {
		//console.error('Reading file://' + proxy_file);
		var proxy_contents = fs.readFileSync(proxy_file).toString();
		var lines          = proxy_contents.split("\n");
		var nb_lines       = lines.length;
		for (var i=0; i<nb_lines; i++) {
			proxies.push(lines[i]);
		}
	}else{
		console.error('Invalid proxy file');
		process.exit(0);
	}
	return proxies;
}


function readKeywordsFile(batch_file) {
	var keywords = [];

	if (curl_config.verbose) {
		console.error('Using batch file : ' + batch_file);
	}

	if (FsExistsSync(batch_file)) {
		//console.error('Reading file://' + batch_file);
		var kw_contents = fs.readFileSync(batch_file).toString();
		var lines       = kw_contents.split("\n");
		var nb_lines    = lines.length;
		for (var i=0; i<nb_lines; i++) {
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
