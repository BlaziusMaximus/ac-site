const path = require('path');
const HTMLWebpackPlugin = require('html-webpack-plugin');
var HTMLWebpackPluginConfig = new HTMLWebpackPlugin({
    template: './src/index.html',
});

module.exports = {
    mode: 'development',
    entry: ['@babel/polyfill', './src/index'],
    resolve: {
        modules: [
            path.join(__dirname, 'src'),
            'node_modules',
        ],
        alias: {
            react: path.join(__dirname, 'node_modules', 'react'),
        },
        extensions: ['*', '.js', '.jsx'],
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
            {
                test: /\.(jpe?g|png|gif|svg)$/i,
                loader: 'file-loader',
                options: {
                    name: '[path][name].[ext]',
                    esModule: false,
                },
            }
        ]
    },
    output: {
        filename: 'transformed.js',
        path: path.resolve(__dirname, 'build'),
    },
    plugins: [ HTMLWebpackPluginConfig ]
};