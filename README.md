node_google_search
==================



Dependencies :
<pre>
jsdom and/or jquery
</pre>


Usage :
<pre>
- google_search.js depends on jquery module.
- google_search_jsdom.js depends on jsdom module.
</pre>
<pre>
$ node google_search.js
NodeJS Google search - version 0.1

Usage: $ node google_search.js [<options>] <keyword>

  Placement options :
	-all			: display all (search+count+ads+stuff)			
	-search			: display search results (natural + onebox + count)
	-search.natural		: display search results 				default display mode
	-search.count | -count 	: display results count
	-ads			: display ads results 					
	-ads.top		: display ads results (only top results)
	-ads.right		: display ads results (only right results)
	-stuff			: display other stuff results
	-stuff.related_bottom	: display suggestions

  Columns options :
	-title			: display links title 					default: not displayed
	-kw			: display request keyword 				default: not displayed
	-domain			: display links domain 					default: not displayed

  Google options :
	-nofilter		: disable duplicate filter search 			default: filter activated
	-num <int>		: nb of results 					default: 10
	-start <int>		: results start offset 					default: 0
	-tld <string>		: google country extension 				default: fr
	-hl | -lang <string>	: google language parameter 		 		default: fr
	-safe <string>		: change safe level (off,moderate,strict)		default: moderate

  Connection options :
	-cache			: use local fs cache 					default: no cache
	-agent <string>		: change user agent 					default: see in code...
	-proxy <string>		: use proxy 		(format: "hostname:port" or "user:password@hostname:port")
	-proxyfile <string>	: use proxy file 	(file format: one proxy per line)

  Misc options :
	-q | -quiet		: disable notice messages				default: false
	-types			: display placements types (and quit)
	-fake			: display google url (and quit)
	-h | -help		: display this message				
</pre>

