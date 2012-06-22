
var http 		= require('http');
var util 		= require('util');
var fs 			= require('fs');
var url 		= require('url');
var crypto 	= require('crypto');
var path 	= require('path');
var jsdom	= require('jsdom');
//var $ 			= require('jquery');


var curl_config = {
	"agent"			: 'Mozilla/5.0 (X11; Linux i686) AppleWebKit/535.7 (KHTML, like Gecko) Ubuntu/11.10 Chromium/16.0.912.77 Chrome/16.0.912.77 Safari/535.7',
	"use_cache"	: false,
	"proxy"			: '',
	"verbose"		: true,
};


var result_types = {
	'search': {
		'onebox' : {
			'jpaths' : [
				'div#search ol#rso li div.obcontainer>div>h3.r>a',		/* onebox ex: "manchester united" */
				'div#search ol#rso li>div>div.ibk>h3.r>a',					/* onebox maps. ex: 12 rue des plantes paris */
				'div#search ol#rso li>div>div.obcontainer>div>h3',		/* onebox billets avion. ex: billet avion agadir */
			]
		},
		'natural' : {
			'jpaths': [
				'div#search ol#rso li>div.vsc>h3.r>a',							/* natural results */
				'div#search ol#rso li>h3.r>a',											/* universal search */
				'div#search ol#rso li>div.vsc>div>table h3.r>a',			/* videos */
			]
		},
		'count':	{
			'jpaths'	: ['#resultStats'],
		}
	},
	'ads': {
		'top': {
			'jpaths':	[
				/* '#tads>ol>li>h3>a', */
				'#tads>ol li>div.vsc>h3>a',		/* ex: jupe rouge */
			],
		},
		'right'	: {
			'jpaths':	[
				'div#rhs_block ol>li>div:nth-child(1)>div>a',		/* adwords google-product with image */
				'div#rhs_block ol li>h3>a',							/* adwords classic */
			],
		},
		'bottom'	: {
			'jpaths':	[
				'#tadsb>ol li>div.vsc>h3>a',			/* ex: jupe twenga */
			],
		},
	},
	'stuff'	: {
		'top'		: {
			'jpaths': [
				'#topstuff>div>div>h2.r>a',							/* bourse. ex: ILD */
				'#search>#ires>ol>li.g div.obcontainer>div>h3.r',	/* meteo. ex: temps a paris */
				'#topstuff>table td>h2.r',							/* maths. ex: pi */
				'#topstuff>div.obp>div.obcontainer>div>div>a',		/* horaire de cinema. ex: projet x */
			],
		},
		'bottom'	: {
			'jpaths': ['#botstuff>div>div>h2.r>a'],		/* some examples ? */
		},
		"related_bottom": {
			'jpaths': ['#botstuff>div#brs>div.brs_col>p>a'],		/* recherches associees */
		},
		"google+_right": {
			'jpaths': ['#rhs_block table.ts div.gl>a'],			/* google+. ex: mon adresse ip */
		},
		"album_search_bottom": {
			'jpaths': ['div#search ol#rso li.g>div>div>a:nth-child(2)'],		/* albums music. ex: rihanna*/
		},
		"maps_right": {
			'jpaths': ['div#rhs_block div.rhsvw span>span>a.fl'],		/* maps, on the right column ex: reston cosmetic dentist */
		},
	},
};
var selected_result_types = [];



var gg_params = {
	"start"					: 0,
	"num"					: 10,
	"tld"						: 'fr',
	"hl"						: 'fr',
	"keyword"			: '',
	"show_title"		: false,
	"show_domain"	: false,
	"show_keyword"	: false,
	"nofilter"				: false,
	"safe"					: 'moderate',	/* *EMPTY*=moderate=images / strict=on=active / off */
	"simulate"		: false,
};


// Parse command line arguments
var arguments = process.argv.splice(2);
parseArguments(arguments);

if (gg_params.keyword == '') {
	usage();
}

// Default mode (display all placements)
if (selected_result_types.length == 0) {
	//selected_result_types = ['search', 'ads', 'stuff'];
	selected_result_types = ['search.natural'];
}

// Handle proxy file
if (curl_config.proxy_file) {
	if (curl_config.verbose) {
		console.error('Using proxy file : ' + curl_config.proxy_file);
	}
	
	if (path.existsSync(curl_config.proxy_file)) {
		//console.error('Reading file://' + curl_config.proxy_file);
		var proxy_contents = fs.readFileSync(curl_config.proxy_file).toString();
		var lines = proxy_contents.split("\n");
		var nb_lines = lines.length;
		var proxy = "";
		var nb_try = 0;
		while (proxy == "") {
			proxy = lines[ Math.floor((Math.random()*nb_lines)) ];
			if (nb_try++ >= 10) {
				console.error("Cannot parse proxy file");
				process.exit(0);
			}
		}
		curl_config.proxy = proxy;
	}else{
		console.error('Invalid proxy file');
		process.exit(0);
	}
	
}

// Process google query
var gg_url = getGoogleWebSearchUrl(gg_params.tld, gg_params.hl, gg_params.keyword, gg_params.start, gg_params.num, gg_params.nofilter, gg_params.safe);

if (gg_params.simulate) {
	console.log(gg_url);
	process.exit(0);
}

// Parse google result content
getPageContent(gg_url, curl_config, function (content) {
	parsePageContent(content, result_types, selected_result_types, parseResultItemGoogle);
});


return;


/* ####################### */

function usage(rc) {
	console.log('Usage: $ node ' + path.basename(process.argv[1]) + ' [<options>] <keyword>');
	console.log('  Placement options :');
	console.log('	-all			: display all (search+count+ads+stuff)			');
	console.log('	-search			: display search results (natural + onebox + count)');
	console.log('	-search.natural		: display search results 				default display mode');
	console.log('	-search.count | -count 	: display results count');
	console.log('	-ads			: display ads results 					');
	console.log('	-ads.top		: display ads results (only top results)');
	console.log('	-ads.right		: display ads results (only right results)');
	console.log('	-stuff			: display other stuff results');
	console.log('	-stuff.related_bottom	: display suggestions');
	console.log('  Columns options :');
	console.log('	-title			: display links title 					default: not displayed');
	console.log('	-kw			: display request keyword 				default: not displayed');
	console.log('	-domain			: display links domain 					default: not displayed');
	console.log('  Google options :');
	console.log('	-nofilter		: disable duplicate filter search 			default: filter activated');
	console.log('	-num <int>		: nb of results 					default: 10');
	console.log('	-start <int>		: results start offset 					default: 0');
	console.log('	-tld <string>		: google country extension 				default: fr');
	console.log('	-hl | -lang <string>	: google language parameter 		 		default: fr');
	console.log('	-safe <string>		: change safe level (off,moderate,strict)		default: moderate');
	console.log('  Connection options :');
	console.log('	-cache			: use local fs cache 					default: no cache');
	console.log('	-agent <string>		: change user agent 					default: see in code...');
	console.log('	-proxy <string>		: use proxy 		(format: "hostname:port" or "user:password@hostname:port")');
	console.log('	-proxyfile <string>	: use proxy file 	(file format: one proxy per line)');
	console.log('  Misc options :');
	console.log('	-q | -quiet		: disable notice messages				default: false');
	console.log('	-types			: display placements types (and quit)');
	console.log('	-fake			: display google url (and quit)');
	console.log('	-h | -help		: display this message				');
	process.exit(rc);
}

/* ####################### */




function parseArguments(arguments) {
	for (var i=0, l=arguments.length; i<l; i++) {
		var arg0 = arguments[i];
		var arg0_short	= arg0.split('.')[0];
		var arg0_option	= (arg0.length <= 1) ? null : arg0.split('.')[1];
		var arg1 = (l>i+1) ? arguments[i+1] : null;

		switch (arg0_short) {
			case '-fake':
			case '-simulate':
				gg_params.simulate = true;
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
				for (key in result_types) {
					if (result_types.hasOwnProperty(key)) {
						var sub_result_types = result_types[key];
						var buffer = [];
						for (sub_key in sub_result_types) {
							buffer[buffer.length] = sub_key;
						}
						console.log(' -' + key + " => " + buffer.join(' '));
					}
				}
				process.exit(0);
				break;
			case '-all':
				selected_result_types = ['search', 'ads', 'stuff'];
				break;
			case '-search':
			case '-ads':
			case '-stuff':
				if (arg0_option) {
					selected_result_types.push(arg0.substr(1));
				}else{
					selected_result_types.push(arg0_short.substr(1));
				}
				break;
			case '-cache':
				curl_config.use_cache = true;
				break;
			case '-title':
				gg_params.show_title = true;
				break;
			case '-domain':
				gg_params.show_domain = true;
				break;
			case '-kw':
				gg_params.show_keyword = true;
				break;
			case '-count':
				selected_result_types.push('search.count');
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
				curl_config.proxy = arg1;
				i++;
				break;
			case '-proxyfile':
				curl_config.proxy_file = arg1;
				i++;
				break;
			default:
				if (gg_params.keyword == '' && arg0.indexOf('-') !== 0) {
					gg_params.keyword = arg0;
				}else if (gg_params.keyword != '') {
					gg_params.keyword += ' ' + arg0;
				}
				break;
		}
	}
}



function getCurlOptionsFromUrl(curl_url, curl_config) {

	var proxy_config 	= {};
	var parts 			= curl_config.proxy.split('@');
	var proxy_host_port = parts[parts.length-1];
	var proxy			= proxy_host_port.split(':');
	var proxy_auth		= (parts.length > 1) ? ('Basic ' + new Buffer(parts[0]).toString('base64')) : '';
	
	var http_auth		= '';	// TODO if needed...

	if (proxy_host_port !== "") {
		if (curl_config.verbose) {
			console.error('Using proxy : ' + proxy_host_port);
		}
	}

	if (proxy != undefined && proxy.length == 2) {
		// Use proxy
		var _url 		= {};
		_url.host 		= proxy[0];
		_url.port 		= proxy[1];
		_url.pathname 	= curl_url;
		_url.search 	= '';

	}else{
		// Direct connection
		var _url 		= url.parse(curl_url);

	}

	var options = {
	    host: _url.host,
	    port: _url.port || 80,
	    path: _url.pathname + (_url.search === undefined ? '' : _url.search),
	    headers: {
	      "User-Agent"			: curl_config.agent,
		  "Proxy-Authorization"	: proxy_auth,
		  "Authorization"		: http_auth,
	    },
	};
	
	return options;
}


function getPageContent(page_url, curl_config, callback) {
	var options = getCurlOptionsFromUrl(page_url, curl_config);

	//var page_url 		= 'http://' + options.host + options.path;
	var url_md5 	= crypto.createHash('md5').update(page_url).digest("hex");
	var cache_file 	= '/tmp/serp_gg_' + url_md5 + '.html';
	
	if (curl_config.verbose) {
		console.error('Remote URL: ' + page_url);
	}

	if (curl_config.use_cache) {
		// Read content from local cache
		if (path.existsSync(cache_file)) {
			if (curl_config.verbose) {
				console.error('Reading cache: file://' + cache_file);
			}
			var html = fs.readFileSync(cache_file).toString();
			return callback(html);
		}
	}

	// Get remote page
	var html = '';
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
			callback(html);
		});
	});

}



function parsePageContent(html, result_types, selected_result_types, callback) {
	
	var window = jsdom.jsdom(html).createWindow();
	jsdom.jQueryify(window, 'http://code.jquery.com/jquery-1.4.2.min.js', function() {
		var $ = window.$;
		
		var $html 			= $(html);
		var display_buffer 	= [];
		
		// FOR EACH RESULT_TYPE (SEARCH, ADS, ...)
		var result_type_name;
		for (var i=0, l=selected_result_types.length; i<l; i++) {
			var result_type_name = selected_result_types[i];
			
			if (result_type_name.indexOf('.') === -1) {
				// Take all the result_type
				var result_type_placements = result_types[result_type_name];
			}else{
				// Take a sub type of result_type
				var parts = result_type_name.split('.');
				var result_type_name = parts[0];
				var result_type_placement_name = parts[1];
				var result_type_placements = {};
				result_type_placements[result_type_placement_name] = result_types[result_type_name][result_type_placement_name];
				
			}
	
			// FOR EACH PLACEMENT OF THE RESULT_TYPE
			for (result_type_placement_name in result_type_placements) {
				var result_type_placement = result_type_placements[result_type_placement_name];
				var jpaths = result_type_placement['jpaths'];
				var jpath  = jpaths.join(',');
	
				var pattern_results = $html.find(jpath);
				var nb_results 		= pattern_results.length;
				if (nb_results == 0) {
					continue;
				}
				//console.log(result_type_name + ' -> ' + result_type_placement_name + ' -> ' + nb_results);
	
				pattern_results.each(function (n, item) {
					var tmp_buffer = callback(n, item, result_type_name, result_type_placement_name, $);
					if (tmp_buffer) {
						for (var i=0, l=tmp_buffer.length; i<l; i++) {
							display_buffer.push(tmp_buffer[i]);
						}
					}
				});
			}
	
		}
	
		displayResults(display_buffer);
		
	});
	

}

/* ####################### SPECIFIC GOOGLE ## */


function getGoogleWebSearchUrl(tld, hl, q, start, num, nofilter, safe) {
	var gg_url = "http://www.google." + tld + '/search';
	gg_url += '?hl=' + hl;
	gg_url += '&q=' + encodeURIComponent(q);
	if (num !== undefined && !isNaN(num))		gg_url += '&complete=0&num=' + num;
	if (start !== undefined && !isNaN(start))	gg_url += '&start=' + start;
	if (nofilter)								gg_url += '&filter=0';
	if (safe != '')								gg_url += '&safe=' + safe;

	return gg_url;
}


function parseResultItemGoogle(n, item, result_type_name, result_type_placement_name, $) {

	var $item 			= $(item);
	var item_tag_name	= item.tagName;
	var item_infos		= parseResultItemInfosGoogle(result_type_name, result_type_placement_name, $item);
	var link_anchor		= $item.text();

	if (item_infos === false || item_infos.length == 0) {
		return;
	}


	// Display result
	var display_tmp_buffer = [];

	var position = n+1;
	var item_buffer = [];
	
	// column "placement"
	item_buffer.push(result_type_name + '.' + result_type_placement_name);
	
	// column "keyword"
	if (gg_params.show_keyword) {
		item_buffer.push(gg_params.keyword);
	}

	// column "position"
	item_buffer.push(position);
	/*
	for (var i=0, l=item_infos.length; i<l; i++) {
		item_buffer.push(item_infos[i]);
		if (! gg_params.show_title) {
			break;
		}
	}
	*/
	
	// column "link"
	item_buffer.push(item_infos[0]);
	
	// column "domain"
	if (gg_params.show_domain) {
		var link	= item_infos[0] + '';
		var parts 	= link.split('/');
		var domain 	= (parts[2] === undefined) ? '' : parts[2];
		item_buffer.push(domain);
	}
	
	// column "title"
	if (gg_params.show_title) {
		item_buffer.push(item_infos[1]);
	}
	
	display_tmp_buffer.push(item_buffer.join("\t"));


	if (result_type_name == 'search' && result_type_placement_name == 'main') {
		// Sitelinks
		var $div_sitelinks = $item.closest('li.g').find('>table div.vsc>span.tl>h3.r>a');

		$div_sitelinks.each(function (n, sitelink) {
			var $sitelink = $(sitelink);
			var sitelink_url = $(sitelink).attr('href');
			var sitelink_text = $(sitelink).text();
			var sitelink_url = "[SITELINK] " + sitelink_url;

			var item_buffer = [];
			
			// column "placement"
			item_buffer.push(result_type_name + '.' + result_type_placement_name);
			

			// column "keyword"
			if (gg_params.show_keyword) {
				item_buffer.push(gg_params.keyword);
			}
			
			// column "position"
			item_buffer.push(position + '-' + (n+1));
			
			// column "link"
			item_buffer.push(sitelink_url);
			
			// column "domain"
			if (gg_params.show_domain) {
				item_buffer.push(domain);
			}
			
			// column "title"
			if (gg_params.show_title) {
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
		'places'	: '&tbm=plcs&',
	};

	var item_text 		= $item.text();
	var item_url 		= $item.attr('href');
	var _url 			= (item_url === undefined) ? null : url.parse(item_url, true);


	function getUniversalSearchType(item_url) {
		var univ_search_type = 'unknown';
		for (univ_search_name in univ_search_patterns) {
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
			var item_int = parseInt(item_text.split(' ')[1].replace(/[\s,]/g, ''));
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

		}else if (extra_data != '') {
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
		}else if (item_url == '') {
			return [item_text, item_text];	// ex: pi
		}

	}else if (result_type_name == 'ads') {
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
