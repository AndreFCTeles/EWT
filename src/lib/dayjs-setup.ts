import dayjs from 'dayjs';
import 'dayjs/locale/pt';
import utc from "dayjs/plugin/utc";
dayjs.extend(utc).locale('pt');

export default dayjs;