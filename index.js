'use strict';

const EventEmitter = require( 'events' ).EventEmitter;
const fs = require( 'fs' );
const path = require( 'path' );

const debug = require( 'debug' )( 'directory-crawler' );
const minimatch = require( 'minimatch' );
const promiseUtil = require( 'promise-util' );
const unzip = require( 'unzip' );

module.exports = class extends EventEmitter {

    /**
     *  @param {Number} [options.parallel=5] Number of files to process in parallel
     *  @param {String} [options.filter=*] Filter for
     */
    constructor( options ) {

        super();

        const parallel = options && options.parallel || 5;
        this.filter = options && options.filter || '*';

        // First in first out queue
        // Ensures only `parallel` files are processed at a time
        this._fifo = promiseUtil.fifo( { parallel } );

        debug( 'parallel', parallel );
        debug( 'directory', this.filter );

    }

    /**
     *  Start crawling
     *  @returns {Promise}
     */
    crawl( directory ) {

        const directoryPath = path.resolve( process.cwd(), directory );
        return this._fileItem( directoryPath );

    }

    /**
     *  Filter files to be emitted
     *  @param {String} filePath The path to be checked
     *  @returns {Boolean}
     */
    _filter( filePath ) {
        return minimatch( filePath, this.filter, { matchBase: true } );
    }

    /**
     *  Is a file a zip file
     *  @param {String} filePath The path to be checked
     *  @returns {Boolean}
     */
    _isZip( filePath ) {

        // Probably some scope for improving this
        const object = path.parse( filePath );
        return object.ext === '.zip';
        
    }

    /**
     *  Iterate a directory
     *  @param {String} directoryPath
     *  @returns {Promise}
     */
    _directory( directoryPath ) {

        debug( '_directory', directoryPath );

        return promiseUtil.callback( fs, 'readdir', directoryPath )
            .then( files => {
                
                debug( '_directory', 'found files', files );

                return Promise.all( files.map( file => {
                
                    const filePath = path.resolve( directoryPath, file );
                    return this._fileItem( filePath );

                } ) );

            } );

    }

    _fileItem( itemPath ) {

        return promiseUtil.callback( fs, 'stat', itemPath )
            .then( stats => {

                if ( stats.isFile() ) {
                    return this._file( itemPath );
                }

                if ( stats.isDirectory() ) {
                    return this._directory( itemPath );
                }

            } );

    }

    /**
     *  Emit a file
     *  @param {String} directoryPath
     *  @returns {Promise|null}
     */
    _file( filePath ) {

        debug( '_file', filePath );

        if ( this._isZip( filePath ) ) {
            return this._unzip( filePath );
        }

        if ( this._filter( filePath ) ) {

            return this._fifo( () => {
               
                debug( '_file', 'fifo entered', filePath );

                const stream = fs.createReadStream( filePath );
                return this._emitFile( stream );
            } );

        }

        return null;

    }

    /**
     *  Unzip a file
     *  @param {String} filePath The path to the file
     *  @returns {Promise} A promise resolving when the zip file is consumed
     */
    _unzip( filePath ) {
        
        debug( '_unzip', filePath );

        const promise = promiseUtil.defer();
        const pipes = [];

        fs.createReadStream( filePath )
            .pipe( new unzip.Parse() )
            .on( 'entry', entry => {

                debug( '_unzip', 'entry', entry.type, entry.path );

                if ( entry.type === 'Directory' ) {
                    entry.autodrain();
                    return;
                }

                if ( this._filter( entry.path ) ) {
                    
                    const queued = this._fifo( () => this._emitFile( entry ) );

                    // Add a catch handler now so we reject early
                    queued.catch( promise.reject );

                    pipes.push( queued );
                    return;
                }

                entry.autodrain();
            } )
            .on( 'close', () => {

                debug( '_unzip', 'end', filePath );
                promise.resolve( Promise.all( pipes ) );
            } )
            .on( 'error', promise.reject );

        return promise;
    }

    /**
     *  Emit a stream
     *  @param {ReadableStream} stream
     *  @returns {Promise} A promise resolving when the stream is consumed
     */
    _emitFile( stream ) {

        debug( '_emitFile', stream.path );

        const promise = promiseUtil.defer();

        stream
            .on( 'end', promise.resolve )
            .on( 'error', promise.reject );

        this.emit( 'file', stream );

        return promise;
    }
};