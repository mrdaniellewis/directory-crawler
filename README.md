# Directory crawler

----

**This is probably better done using gulp**.  As such this library was never used.

----

Crawls a directory and emitting an event each time a matching file is found.

If a zip file is encountered (that is a file with the .zip extension), it will
automatically be expanded and the files processed as if they were normal files.

```js

var directoryCrawler = new DirectoryCrawler( {
	
	parallel: 5 		// Number of file streams to process at once - defaults to 5
	
	filter: '*.css' 	// glob to filter the files to process, defaults to '*'

} );

directoryCrawler.on( 'file', function( stream ) {
	
	// stream is a readable stream, do something useful
	// make sure it is consumed

	stream.resume();
	
} );

// Crawl a directory
directoryCrawler.crawl( './data' )
	.then( function() {
		// All OK
	} )
	.catch( function() {
		// It went horribly wrong
	} );
	
```