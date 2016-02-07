/* eslint-env mocha */
/* eslint prefer-arrow-callback: 0 */
'use strict';

const EventEmitter = require( 'events' ).EventEmitter;
const path = require( 'path' );
const stream = require( 'stream' );

const expect = require( 'expect' );
const mkdirp = require( 'mkdirp' );
const promiseUtil = require( 'promise-Util' );

const DirectoryCrawler = require( '../index.js' );

describe( 'DirectoryCrawler', function() {

    it( 'is a function', function() {

        expect( DirectoryCrawler ).toBeA( Function );

    } );

    it( 'returns a DirectoryCrawler instance', function() {

        const directoryCrawler = new DirectoryCrawler( {} );

        expect( directoryCrawler ).toBeA( DirectoryCrawler );

    } );

    it( 'is an EventEmitter', function() {

        const directoryCrawler = new DirectoryCrawler();

        expect( directoryCrawler ).toBeAn( EventEmitter );

    } );

    describe( 'crawl', function() {

        before( function() {

            const directoryPath = path.resolve( __dirname, 'empty-directory' );
            mkdirp.sync( directoryPath );

        } );

        it( 'returns a Promise resolving when completed', function() {

            const directoryPath = path.resolve( __dirname, 'empty-directory' );
            const directoryCrawler = new DirectoryCrawler();

            return directoryCrawler.crawl( directoryPath );

        } );

        it( 'resolves paths relative to the cwd', function() {

            // Should have the same result as above
            const directoryCrawler = new DirectoryCrawler();
            return directoryCrawler.crawl( './test/empty-directory' );

        } );

        it( 'rejects the promise if an error is encountered', function() {

            // Should have the same result as above
            const directoryCrawler = new DirectoryCrawler();
            return directoryCrawler.crawl( './test/i-no-not-exist' )
                .then( () => {
                    throw new Error( 'Should not have resolved' );
                } )
                .catch( e => {
                    expect( e.code ).toBe( 'ENOENT' );
                } );

        } );

        it( 'emits a file event when encountering a file', function() {

            const directoryCrawler = new DirectoryCrawler();
            const spy = expect.createSpy().andCall( file => {
                file.resume();
            } );

            directoryCrawler.on( 'file', spy );

            const directory = path.resolve( __dirname, 'one-file' );
            const expectedFilePath = path.resolve( directory, 'one.txt' );

            return directoryCrawler.crawl( directory )
                .then( () => {
                    
                    expect( spy.calls.length ).toEqual( 1 );
                    expect( spy.calls[0].arguments[0] ).toBeA( stream.Readable );
                    expect( spy.calls[0].arguments[0].path ).toEqual( expectedFilePath ); 
                } );

        } );

        it( 'can crawl a file', function() {

            const directoryCrawler = new DirectoryCrawler();
            const spy = expect.createSpy().andCall( file => {
                file.resume();
            } );

            directoryCrawler.on( 'file', spy );

            const expectedFilePath = path.resolve( __dirname, 'one-file', 'one.txt' );

            return directoryCrawler.crawl( expectedFilePath )
                .then( () => {
                    
                    expect( spy.calls.length ).toEqual( 1 );
                    expect( spy.calls[0].arguments[0] ).toBeA( stream.Readable );
                    expect( spy.calls[0].arguments[0].path ).toEqual( expectedFilePath ); 
                } );

        } );

        it( 'recursively crawls directories', function() {

            const directoryCrawler = new DirectoryCrawler();
            const spy = expect.createSpy().andCall( file => {
                file.resume();
            } );

            directoryCrawler.on( 'file', spy );

            const directory = path.resolve( __dirname, 'recursive-directories' );
            const expectedFilePath = path.resolve( 
                directory,
                'sub-directory/recursive.txt'
            );

            return directoryCrawler.crawl( directory )
                .then( () => {
                    
                    expect( spy.calls.length ).toEqual( 1 );
                    expect( spy.calls[0].arguments[0] ).toBeA( stream.Readable );
                    expect( spy.calls[0].arguments[0].path ).toEqual( expectedFilePath ); 
                } );

        } );

        it( 'follows symbolic links', function() {

            const directoryCrawler = new DirectoryCrawler();
            const spy = expect.createSpy().andCall( file => {
                file.resume();
            } );

            directoryCrawler.on( 'file', spy );

            const directory = path.resolve( __dirname, 'symbolic-link' );
            const expectedFilePath = path.resolve( directory, 'one.txt' );

            return directoryCrawler.crawl( directory )
                .then( () => {
                    
                    expect( spy.calls.length ).toEqual( 1 );
                    expect( spy.calls[0].arguments[0] ).toBeA( stream.Readable );
                    expect( spy.calls[0].arguments[0].path ).toEqual( expectedFilePath ); 
                } );

        } );

        it( 'only emits files matching the filter setting', function() {

            const directoryCrawler = new DirectoryCrawler( { filter: 'three.txt' } );
            const spy = expect.createSpy().andCall( file => {
                file.resume();
            } );

            directoryCrawler.on( 'file', spy );

            const directory = path.resolve( __dirname, 'many-files' );
            const expectedFilePath = path.resolve( directory, 'three.txt' );

            return directoryCrawler.crawl( directory )
                .then( () => {
                    
                    expect( spy.calls.length ).toEqual( 1 );
                    expect( spy.calls[0].arguments[0] ).toBeA( stream.Readable );
                    expect( spy.calls[0].arguments[0].path ).toEqual( expectedFilePath ); 
                } );

        } );

        it( 'does not emit more than parallel files than set by the parallel option', function() {

            const directoryCrawler = new DirectoryCrawler( { parallel: 2 } );
            const files = [];
            const spy = expect.createSpy().andCall( file => {
                files.push( file );
            } );

            directoryCrawler.on( 'file', spy );

            const directory = path.resolve( __dirname, 'many-files' );

            const promise = directoryCrawler.crawl( directory );
            
            // Wait enough time for the 2 files to have blocked the crawler
            return promiseUtil.wait( 500 )
                .then( () => {
                    expect( spy.calls.length ).toEqual( 2 );
                    // Replace push with a function to automatically resume the files
                    files.push = file => file.resume();
                    // Resume the existing files
                    files.forEach( file => file.resume() );

                    // Wait for all files to have finished
                    return promise;
                } )
                .then( () => {
                    expect( spy.calls.length ).toEqual( 6 );
                } );

        } );

        describe( 'when encountering zip files', function() {

            it( 'extracts the files within the zip', function() {

                const directoryCrawler = new DirectoryCrawler();
                const spy = expect.createSpy().andCall( file => {
                    file.resume();
                } );

                directoryCrawler.on( 'file', spy );

                const directory = path.resolve( __dirname, 'containing-zip' );

                return directoryCrawler.crawl( directory )
                    .then( () => {
                        expect( spy.calls.length ).toEqual( 6 );
                    } );

            } );

            it( 'does not emit more than parallel files than set by the parallel option', function() {

                const directoryCrawler = new DirectoryCrawler( { parallel: 2 } );
                const files = [];
                const spy = expect.createSpy().andCall( file => {
                    files.push( file );
                } );

                directoryCrawler.on( 'file', spy );

                const directory = path.resolve( __dirname, 'containing-zip' );

                const promise = directoryCrawler.crawl( directory );
                
                // Wait enough time for the 2 files to have blocked the crawler
                return promiseUtil.wait( 500 )
                    .then( () => {
                        expect( spy.calls.length ).toEqual( 2 );
                        // Replace push with a function to automatically resume the files
                        files.push = file => file.resume();
                        // Resume the existing files
                        files.forEach( file => file.resume() );

                        // Wait for all files to have finished
                        return promise;
                    } )
                    .then( () => {
                        expect( spy.calls.length ).toEqual( 6 );
                    } );

            } );

            it( 'only emits files matching the filter setting', function() {

                const directoryCrawler = new DirectoryCrawler( { filter: 'three.txt' } );
                const spy = expect.createSpy().andCall( file => {
                    file.resume();
                } );

                directoryCrawler.on( 'file', spy );

                const directory = path.resolve( __dirname, 'containing-zip' );

                return directoryCrawler.crawl( directory )
                    .then( () => {
                        expect( spy.calls.length ).toEqual( 1 );

                        const filename = path.parse( spy.calls[0].arguments[0].path );
                        expect( filename.base ).toEqual( 'three.txt' );
                    } );

            } );

        } );

    } );

} );
