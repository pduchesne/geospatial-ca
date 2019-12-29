const HtmlWebPackPlugin = require('html-webpack-plugin');
var webpack = require('webpack');

var path = require('path');

// this will create index.html file containing script
// source in dist folder dynamically
const htmlPlugin = new HtmlWebPackPlugin({
    template: './src/index.html',
    filename: './index.html'
});

var localVariables;
try {
    localVariables = require('./local-config.json');
} catch (e) {}
const definePlugin = new webpack.DefinePlugin({
    PROXY_URL: (localVariables && JSON.stringify(localVariables.proxyUrl)) || false
});

const dev = true;

var styleLoader = 'style-loader';
var cssLoader = {
    loader: 'css-loader',
    options: {
        importLoaders: 1,
        // we are not using css modules
        modules: false //{ localIdentName: '[name]__[local]___[hash:base64:5]' },
    }
};


module.exports = {
    mode: dev ? 'development' : 'production',
    optimization: { minimize: !dev },

    //specify the entry point for your project
    entry: './src/index.tsx',
    // specify the output file name
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        //publicPath: '/',
        libraryTarget: 'umd',
        umdNamedDefine: true

    },
    resolve: {
        // this is required to be able to do non relative imports of src code
        modules: [path.resolve('./src'), path.resolve('./node_modules')],
        // Add `.ts` and `.tsx` as a resolvable extension.
        extensions: ['.ts', '.tsx', '.js']
    },
    target: 'web',
    devtool: 'source-map',
    module: {
        // consists the transform configuration
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'ts-loader'
            },
            {
                test: /\.css$/,
                use: [styleLoader, cssLoader]
            }
        ]
    },
    // this will create a development server to host our application
    // and will also provide live reload functionality
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        compress: true,
        port: 3000,
        // needed to properly support BrowsrRouter
        // see https://stackoverflow.com/questions/43209666/react-router-v4-cannot-get-url
        historyApiFallback: true
    },

    // this will watch the bundle for any changes
    //watch: true,
    // specify the plugins which you are using
    plugins: [htmlPlugin, definePlugin]
};
