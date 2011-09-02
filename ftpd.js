
var net = require("net");
var sys = require("sys");
var fs = require("fs");
var dummyfs = require("./dummyfs");
var exec = require('child_process').exec;

/*
TODO:
- Implement Full RFC 959
- Implement RFC 2428
- Implement RFC 2228
- Implement RFC 3659
- Implement TLS - http://en.wikipedia.org/wiki/FTPS
*/

// String.prototype.trim = function() {
    // return this.replace(/^\s+|\s+$/g,"");
// }

// For some reason, the FTP server 


function dotrace(traceline) {
    console.log(traceline);
}

function fixPath(fs, path) {
    if (path.charAt(0) == '/')
        return path.trim();
    else
        return fs.cwd() + path.trim();
}

// host should be an IP address, and sandbox a path without trailing slash for now
function createServer(host, sandbox)
{
    // make sure host is an IP address, otherwise DATA connections will likely break
    var server = net.createServer(function (socket) {
        socket.setTimeout(0);
        socket.setEncoding("ascii"); // force data String not Buffer
        socket.setNoDelay();
        
        // this is still not quite right ... thinking data connection setup and management should get its own event queue.
        // Purpose of this is to establish a data connection, and run the callback when it's ready
        // Connection might be passive or non-passive
        var whenDataWritable = function(callback) {
            if (socket.passive) {
                if (socket.dataSocket) {
                    dotrace("Re-using existing passive data socket");
                    if (socket.dataSocket.writable) callback(socket.dataSocket);
                } else {
                    dotrace("passive, but no dataSocket to use");
                    socket.write("425 Can't open data connection\r\n");
                }
            } else {
                // Do we need to open the data connection?
                if (socket.dataSocket) {
                    dotrace("using non-passive dataSocket");
                    callback(socket.dataSocket);
                } else {
                    dotrace("Opening data connection to client at " + socket.dataHost + ":" + socket.dataPort);
                    var dataSocket = net.createConnection(socket.dataPort, socket.dataHost);
                    dataSocket.addListener("connect", function() {
                        socket.dataSocket = dataSocket;
                        dotrace("Data event: connect");
                        callback(dataSocket);
                    });
                    dataSocket.addListener("close", function(had_error) {
                        socket.dataSocket = null;
                        dotrace("Data event: close" + (had_error ? " (due to error)" :""));
                        
                    });
                    dataSocket.addListener("end", function() {
                        dotrace("Data event: end");
                    });
                    dataSocket.addListener("error", function(err) {
                        dotrace("Data event: error: " + err);
                        dataSocket.destroy();
                    });
                }
            }
        };

        socket.passive = false;
        socket.dataHost = null;
        socket.dataPort = 20; // default
        socket.dataSocket = null;
        socket.pasvport = 0;
        socket.pasvaddress = "";
        socket.mode = "ascii";
        // these few don't seem necessary
        socket.filefrom = "";

        socket.username = "";
        socket.datatransfer = null;
        socket.totsize = 0;
        socket.filename = "";
        
        socket.sandbox = sandbox; // path which we're starting relative to
        // dummyfs needs to accept initial path so we can sandbox
        socket.fs = new dummyfs.dummyfs("/");
        dotrace("CWD = "+socket.fs.cwd());
        
        socket.addListener("connect", function () {
            dotrace("Server event: connect");
            //socket.send("220 NodeFTPd Server version 0.0.10\r\n");
            //socket.write("220 written by Andrew Johnston (apjohnsto@gmail.com)\r\n");
            //socket.write("220 Please visit http://github.com/billywhizz/NodeFTPd\r\n");
            socket.write("220 FTP server (nodeftpd) ready\r\n");
        });
        
        socket.addListener("data", function (data) {
            data = (data+'').trim();
            dotrace("Server event: data: " + data);

            var command, arg;
            var index = data.indexOf(" ");
            if (index > 0)
            {
                command = data.substring(0, index);
                commandArg = data.substring(index+1, data.length);
            }
            else
            {
                command = data;
                commandArg = '';
            }
            
            switch(command.trim().toUpperCase())
            {
            case "ABOR":
                // Abort an active file transfer.
                socket.write("202 Not supported\r\n");
                break;
            case "ACCT":
                // Account information
                socket.write("202 Not supported\r\n");
                break;
            case "ADAT":
                // Authentication/Security Data (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "ALLO":
                // Allocate sufficient disk space to receive a file.
                socket.write("202 Not supported\r\n");
                break;
            case "APPE":
                // Append.
                socket.write("202 Not supported\r\n");
                break;
            case "AUTH":
                // Authentication/Security Mechanism (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "CCC":
                // Clear Command Channel (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "CDUP":
                // Change to Parent Directory.
                // Do we need to report whether we were already at the top-level?
                // Any other errors to report?
                socket.write("250 Directory changed to " + socket.fs.chdir("..") + "\r\n");
                break;
            case "CONF":
                // Confidentiality Protection Command (RFC 697)
                socket.write("202 Not supported\r\n");
                break;
            case "CWD":
                // Change working directory.
                socket.write("250 CWD successful. \"" + socket.fs.chdir(commandArg.trim()) + "\" is current directory\r\n");
                break;
            case "DELE":
                // Delete file.
                // same problem again with size, repeating paths
                var filename = fixPath(socket.fs, commandArg);
                fs.unlink(socket.sandbox + filename, function(err){
                    if (err) {
                        dotrace("Error deleting file: "+filename+", "+err);
                        // write error to socket
                    } else
                        socket.write("250 file deleted\r\n");
                });
                break;
            case "ENC":
                // Privacy Protected Channel (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "EPRT":
                // Specifies an extended address and port to which the server should connect. (RFC 2428)
                socket.write("202 Not supported\r\n");
                break;
            case "EPSV":
                // Enter extended passive mode. (RFC 2428)
                socket.write("202 Not supported\r\n");
                break;
            case "FEAT":
                // Get the feature list implemented by the server. (RFC 2389)
                socket.write("211-Features\r\n");
                socket.write(" SIZE\r\n");
                socket.write("211 end\r\n");
                break;
            case "HELP":
                // Returns usage documentation on a command if specified, else a general help document is returned.
                /*
                        214-The following commands are recognized:
                        USER   PASS   QUIT   CWD    PDD    PORT   PASV   TYPE
                        LIST   REST   CDUP   RETR   STOR   SIZE   DELE   RMD
                        MKD    RNFR   RNTO   ABOR   SYST   NOOP   APPE   NLST
                        MDTM   XPWD   XCUP   XMKD   XRMD   NOP    EPSV   EPRT
                        AUTH   ADAT   PBSZ   PROT   FEAT   MODE   OPTS   HELP
                        ALLO   MLST   MLSD   SITE   P@SW   STRU   CLNT   MFMT
                        214 Have a nice day.		
                        */
                socket.write("202 Not supported\r\n");
                break;
            case "LANG":
                // Language Negotiation (RFC 2640)
                socket.write("202 Not supported\r\n");
                break;
            case "LIST":
                // Returns information of a file or directory if specified, else information of the current working directory is returned.
                // Passive connection may or may not already be established
                // Is the passive connection writable?
                // If not, 

                whenDataWritable( function(pasvconn) {
                    dotrace("Sending file list");
                    fs.readdir(socket.sandbox + socket.fs.cwd(), function(err, files) {
                        var path = socket.sandbox + socket.fs.cwd();
                        dotrace(path);
                        if (err) {
                            dotrace("Error: " + err);
                            pasvconn.write("");
                        } else {
                            for (var i = 0; i < files.length; i++) {
                                var file = files[ i ];
                                var s = fs.statSync(path + file);
                                var r = "r";
                                var w = "w";
                                var x = "x";
                                var h = "-";
                                var line = s.isDirectory() ? "d" : h;
                                var mode = s.mode;
                                line += (0400 & mode) ? r : h;
                                line += (0200 & mode) ? w : h;
                                line += (0100 & mode) ? x : h;
                                line += (040 & mode) ? r : h;
                                line += (020 & mode) ? w : h;
                                line += (010 & mode) ? x : h;
                                line += (04 & mode) ? r : h;
                                line += (02 & mode) ? w : h;
                                line += (01 & mode) ? x : h;
                                line += " 1 ftp ftp ";
                                for (var j = s.size.toString().length; j < 12; j++) line += " ";
                                line += s.size + " ";
                                line += "Aug 1 09:27 ";
                                line += file + "\r\n";
                                pasvconn.write(line);
                            }
                        }
                        pasvconn.end();
                        socket.write("226 Transfer OK\r\n");
                    });
                });
                break;
            case "LPRT":
                // Specifies a long address and port to which the server should connect. (RFC 1639)
                socket.write("202 Not supported\r\n");
                break;
            case "LPSV":
                // Enter long passive mode. (RFC 1639)
                socket.write("202 Not supported\r\n");
                break;
            case "MDTM":
                // Return the last-modified time of a specified file. (RFC 3659)
                socket.write("202 Not supported\r\n");
                break;
            case "MIC":
                // Integrity Protected Command (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "MKD":
                // Make directory.
                var filename = fixPath(socket.fs, commandArg);
                fs.mkdir(socket.sandbox + filename, 0755, function(err){
                    if(err) {
                        dotrace("Error making directory "+filename);
                        // write error to socket
                    } else
                        socket.write("257 \""+filename+"\" directory created\r\n");
                });
                break;
            case "MLSD":
                // Lists the contents of a directory if a directory is named. (RFC 3659)
                socket.write("202 Not supported\r\n");
                break;
            case "MLST":
                // Provides data about exactly the object named on its command line, and no others. (RFC 3659)
                socket.write("202 Not supported\r\n");
                break;
            case "MODE":
                // Sets the transfer mode (Stream, Block, or Compressed).
                socket.write("202 Not supported\r\n");
                break;
            case "NLST":
                // Returns a list of file names in a specified directory.
                socket.write("202 Not supported\r\n");
                break;
            case "NOOP":
                // No operation (dummy packet; used mostly on keepalives).
                socket.write("202 Not supported\r\n");
                break;
            case "OPTS":
                // Select options for a feature. (RFC 2389)
                socket.write("202 Not supported\r\n");
                break;
            case "PASS":
                // Authentication password.
                socket.write("230 Logged on\r\n");
                // Verify credentials using user and pass
                break;
            case "PASV":
                // Enter passive mode. This creates the listening socket.
                // But this doesn't prevent more than 1 data connection
                socket.passive = true;
                socket.dataSocket = null;
                // you can enter passive without data waiting to be transferred
                var pasv = net.createServer(function (psocket) {
                    // 'connection' event has fired on server ... now set socket listeners
                    psocket.addListener("connect", function () {
                        socket.write("150 Connection Accepted\r\n");
                        dotrace("Passive data event: connect");
                        socket.dataSocket = psocket;
                    });
                    psocket.addListener("end", function () {
                        dotrace("Passive data event: end");
                        //pasv.close();
                    });
                    psocket.addListener("error", function(err) {
                        dotrace("Passive data event: error: " + err);
                        psocket.destroy();
                    });
                    psocket.addListener("close", function(had_error) {
                        dotrace("Passive data event: close " + (had_error ? " (due to error)" : ""));
                        socket.dataSocket = null;
                    });
                });
                // Once we're successfully listening, tell the client
                pasv.addListener("listening", function() {
                    var port = pasv.address().port;
                    socket.dataHost = host;
                    socket.dataPort = port;
                    dotrace("Passive data event: listening on port " + port);
                    var i1 = parseInt(port / 256);
                    var i2 = parseInt(port % 256);
                    socket.write("227 Entering Passive Mode (" + host.split(".").join(",") + "," + i1 + "," + i2 + ")\r\n");
                });
                pasv.listen(0, host);
                break;
            case "PBSZ":
                // Protection Buffer Size (RFC 2228)
                socket.write("202 Not supported\r\n");
                break;
            case "PORT":
                // Specifies an address and port to which the server should connect.
                socket.passive = false;
                socket.dataSocket = null;
                var addr = commandArg.split(",");
                socket.dataHost= addr[0]+"."+addr[1]+"."+addr[2]+"."+addr[3];
                socket.dataPort = (parseInt(addr[4]) * 256) + parseInt(addr[5]);
                socket.write("200 PORT command successful.\r\n");
                break;
            case "PWD":
                // Print working directory. Returns the current directory of the host.
                socket.write("257 \"" + socket.fs.cwd() + "\" is current directory\r\n");
                break;
            case "QUIT":
                // Disconnect.
                
                socket.write("221 Goodbye\r\n");
                socket.end();
                break;
            case "REIN":
                // Re initializes the connection.
                socket.write("202 Not supported\r\n");
                break;
            case "REST":
                // Restart transfer from the specified point.
                socket.totsize = parseInt(commandArg.trim());
                socket.write("350 Rest supported. Restarting at " + socket.totsize + "\r\n");
                break;
            case "RETR":
                // Retrieve (download) a remote file.
                whenDataWritable( function(pasvconn) {
                    pasvconn.setEncoding(socket.mode);

                    var filename = fixPath(socket.fs, commandArg);
                    if(filename != socket.filename)
                    {
                        socket.totsize = 0;
                        socket.filename = filename;
                    }
                    fs.open(socket.sandbox + socket.filename, process.O_RDONLY, 0666, function (err, fd) {
                        dotrace("DATA file " + socket.filename + " opened");
                        function readChunk() {
                            fs.read(fd, 4096, socket.totsize, socket.mode, function(err, chunk, bytes_read) {
                                if(err) {
                                    dotrace("Erro reading chunk");
                                    throw err;
                                    return;
                                }
                                if(chunk) {
                                    socket.totsize += bytes_read;
                                    if(pasvconn.readyState == "open") pasvconn.write(chunk, socket.mode);
                                    readChunk();
                                }
                                else {
                                    dotrace("DATA file " + socket.filename + " closed");
                                    pasvconn.end();
                                    socket.write("226 Closing data connection, sent " + socket.totsize + " bytes\r\n");
                                    fs.close(fd);
                                    socket.totsize = 0;
                                }
                            });
                        }
                        if(err) {
                            dotrace("Error at read");
                            throw err;
                        }
                        else {
                            readChunk();
                        }
                    });
                });
                break;
            case "RMD":
                // Remove a directory.
                var filename = fixPath(socket.fs, commandArg);
                fs.rmdir(socket.sandbox + filename, function(err){
                    if(err) {
                        dotrace("Error removing directory "+filename);
                        // write error to socket
                    } else
                        socket.write("250 \""+filename+"\" directory removed\r\n");
                });
                break;
            case "RNFR":
                // Rename from.
                socket.filefrom = fixPath(socket.fs, commandArg);
                dotrace("Rename from "+socket.filefrom);
                // check whether exists
                socket.write("350 File exists, ready for destination name.\r\n");
                break;
            case "RNTO":
                // Rename to.
                var fileto = fixPath(socket.fs, commandArg);
                fs.rename(socket.sandbox + socket.filefrom, socket.sandbox + fileto, function(err){
                    if(err) {
                        dotrace("Error renaming file from "+socket.filefrom+" to "+fileto);
                        // write error to socket
                    } else
                        socket.write("250 file renamed successfully\r\n");
                });
                break;
            case "SITE":
                // Sends site specific commands to remote server.
                socket.write("202 Not supported\r\n");
                break;
            case "SIZE":
                // Return the size of a file. (RFC 3659)
                var filename = socket.fs.cwd() + commandArg.trim();
                fs.stat(socket.sandbox + filename, function (err, s) {
                    if(err) { 
                        dotrace("Error getting size of file: "+filename);
                        throw err;
                    }
                    socket.write("213 " + s.size + "\r\n");
                });
                break;
            case "SMNT":
                // Mount file structure.
                socket.write("202 Not supported\r\n");
                break;
            case "STAT":
                // Returns the current status.
                
                /* from FileZilla
                        Connected to 192.168.2.100.
                        No proxy connection.
                        Mode: stream; Type: ascii; Form: non-print; Structure: file
                        Verbose: on; Bell: off; Prompting: on; Globbing: on
                        Store unique: off; Receive unique: off
                        Case: off; CR stripping: on
                        Ntrans: off
                        Nmap: off
                        Hash mark printing: off; Use of PORT cmds: on
                        Tick counter printing: off
                        */
                socket.write("202 Not supported\r\n");
                break;
            case "STOR":
                // Store (upload) a file.
                whenDataWritable( function(pasvconn) {
                    pasvconn.setEncoding(socket.mode);
                    pasvconn.pause();
                    filename = fixPath(socket.fs, commandArg);

                    fs.open(socket.sandbox + filename, 'w', 0644, function(err, fd) {
                        if(err) {
                            dotrace('Error opening file: '+filename);
                            throw err;
                        }

                        var size = 0;
                        var paused = false;
                        var npauses = 0;
                        pasvconn.addListener("data", function(data) {
                            size += data.length;
                            fs.write(fd, data, null, socket.mode, function(err, bytes_written) {
                                if(err) {
                                    dotrace("Error writing file");
                                    throw err;
                                }
                                else {
                                    dotrace("Bytes written: "+bytes_written);
                                }
                                if (!paused) {
                                    pasvconn.pause();
                                    npauses += 1;
                                    paused = true;
                                    setTimeout(function () {
                                        pasvconn.resume();
                                        paused = false;
                                    }, 1);
                                }
                            });
                        });
                        /*
                        pasvconn.addListener("connect", function () {
                            dotrace("DATA connect");
                            socket.write("150 Connection Accepted\r\n");
                        });
                        */
                        
                        pasvconn.addListener("end", function () {
                            fs.close(fd, function(err) {
                                if (err) dotrace("Error closing file: "+fd+" ("+err+")");
                            });
                            dotrace("DATA end");
                            socket.write("226 Closing data connection, recv " + size + " bytes\r\n");
                        });
                        pasvconn.addListener("error", function(had_error) {
                            dotrace("DATA error: " + had_error);
                        });
                        pasvconn.resume();
                    });
                });
                break;
            case "STOU":
                // Store file uniquely.
                socket.write("202 Not supported\r\n");
                break;
            case "STRU":
                // Set file transfer structure.
                socket.write("202 Not supported\r\n");
                break;
            case "SYST":
                // Return system type.
                socket.write("215 UNIX emulated by NodeFTPd\r\n");
                break;
            case "TYPE":
                // Sets the transfer mode (ASCII/Binary).
                if(commandArg.trim() == "A"){
                    socket.mode = "ascii";
                    socket.write("200 Type set to A\r\n");			
                }
                else{
                    socket.mode = "binary";
                    socket.write("200 Type set to I\r\n");			
                }
                break;
            case "USER":
                // Authentication username.
                socket.username = commandArg.trim();
                socket.write("331 password required for " + socket.username + "\r\n");
                break;
            case "XPWD":
                // 
                socket.write("257 " + socket.fs.cwd() + " is the current directory\r\n");
                break;
            default:
                socket.write("202 Not supported\r\n");
                break;
            }
        });
        
        socket.addListener("end", function () {
            dotrace("Socket end");
            socket.end(); // ?
        });
        socket.addListener("error", function (err) {
            dotrace("Socket error: " + err);
        });  
    });

    return server;
}
sys.inherits(createServer, process.EventEmitter);
// for testing
//createServer("127.0.0.1", "/").listen(7001);
exports.createServer = createServer;
