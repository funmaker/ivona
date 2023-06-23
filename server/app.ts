import * as http from 'http';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { router } from "./routes";
import HTTPError from "./helpers/HTTPError";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/', express.static('static'));

if(process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/', router);

app.use((req, res, next) => {
  next(new HTTPError(404));
});

app.use((err: Partial<HTTPError>, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  
  const code = err.HTTPcode || 500;
  const result = {
    code,
    message: err.publicMessage || http.STATUS_CODES[code],
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  };
  res.status(code).json(result);
});

export default app;
