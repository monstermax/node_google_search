
var system = require('system');

var arguments = phantom.args;

console.log("arguments", arguments);


var page = require('webpage').create();

console.log('The default user agent is ' + page.settings.userAgent);
//page.settings.userAgent = 'SpecialAgent';

if (arguments[0] === undefined) {
	console.log("ERROR. missing argument keyword");
	phantom.exit();
}

var keyword = arguments[0];
var remote_url = 'http://www.google.fr/search?hl=fr&q=' + keyword + '&complete=0&num=10&start=0&safe=moderate';

page.open(remote_url, function (status) {
    if (status !== 'success') {
        console.log('Unable to access network');

    } else {

	//page.injectJs('jquery-1.6.1.min.js');
	page.includeJs('https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js', function () {

		var results = page.evaluate(function() {
			var test = $('h3.r a');
			console.log("test", test);
			//phantom.exit();
			return test;
		});

		console.log(results);
		return phantom.exit();
	});


    }
});


