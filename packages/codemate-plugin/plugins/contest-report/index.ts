import {
    ContestNotAttendedError,
    ContestNotEndedError,
    ContestScoreboardHiddenError,
    type Context,
    db,
    Handler,
    moment,
    NotAssignedError,
    ObjectId,
    param,
    PERM,
    type Tdoc,
    Types,
} from 'hydrooj';
import { GroupModel } from '../privilege-group/model';

const TYPE_CONTEST_REPORT = 33;

export interface ContestReportDoc {
    docType: 33;
    docId: ObjectId;
    tid: ObjectId;
    owner: number;
    date: string; // YYYYMMDD
    idByDate: number;
}

declare module 'hydrooj' {
    interface DocType {
        [TYPE_CONTEST_REPORT]: ContestReportDoc;
    }
}

const coll = db.collection('document');

class ContestReportHandler extends Handler {
    tdoc?: Tdoc;
    tsdoc?: any;

    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid: ObjectId) {
        // Init contest data
        [this.tdoc, this.tsdoc] = await Promise.all([
            Hydro.model.contest.get(domainId, tid),
            Hydro.model.contest.getStatus(domainId, tid, this.user._id),
        ]);
        if (this.tdoc.assign?.length && !this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
            const groups = await GroupModel.list(domainId, this.user._id);
            if (
                !Set.intersection(
                    this.tdoc.assign,
                    groups.map((i) => i.name),
                ).size
            ) {
                throw new NotAssignedError('contest', tid);
            }
        }
        if (this.tdoc.duration && this.tsdoc?.startAt) {
            this.tsdoc.endAt = moment(this.tsdoc.startAt).add(this.tdoc.duration, 'hours').toDate();
        }

        // Check permission
        if (!this.tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);
        if (!Hydro.model.contest.isDone(this.tdoc, this.tsdoc)) {
            throw new ContestNotEndedError('contest', tid);
        }
        if (!Hydro.model.contest.canShowScoreboard.call(this, this.tdoc, true)) {
            throw new ContestScoreboardHiddenError(tid);
        }
    }

    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        let doc = await coll.findOne<ContestReportDoc>({ docType: TYPE_CONTEST_REPORT, tid, owner: this.user._id });

        if (!doc) {
            const date = moment().format('YYYYMMDD');
            const newId =
                ((await coll.findOne<ContestReportDoc>({ docType: TYPE_CONTEST_REPORT, date }, { sort: { idByDate: -1 } }))?.idByDate || 0) + 1;

            await coll.insertOne({
                docType: TYPE_CONTEST_REPORT,
                docId: new ObjectId(),
                tid,
                owner: this.user._id,
                date,
                idByDate: newId,
            });

            doc = await coll.findOne<ContestReportDoc>({ docType: TYPE_CONTEST_REPORT, tid, owner: this.user._id });
        }

        const pdict = await Hydro.model.problem.getList(domainId, this.tdoc.pids, true, true, Hydro.model.problem.PROJECTION_LIST);

        this.response.body = {
            report_id: `${doc.date}-${doc.idByDate}`,
            uname: this.user.uname,
            pdict,
            psdict: {},
            rdict: {},
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
        };

        this.response.body.psdict = this.tsdoc.detail || {};
        const psdocs: any[] = Object.values(this.response.body.psdict);

        if (Hydro.model.contest.canShowSelfRecord.call(this, this.tdoc)) {
            [this.response.body.rdict, this.response.body.rdocs] = await Promise.all([
                Hydro.model.record.getList(
                    domainId,
                    psdocs.map((i: any) => i.rid),
                ),
                await Hydro.model.record.getMulti(domainId, { contest: tid, uid: this.user._id }).sort({ _id: -1 }).toArray(),
            ]);
            if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
                this.response.body.rdocs = this.response.body.rdocs.map((rdoc) => Hydro.model.contest.applyProjection(this.tdoc, rdoc, this.user));
                for (const psdoc of psdocs) {
                    this.response.body.rdict[psdoc.rid] = Hydro.model.contest.applyProjection(
                        this.tdoc,
                        this.response.body.rdict[psdoc.rid],
                        this.user,
                    );
                }
            }
            this.response.body.canViewRecord = true;
        } else {
            for (const i of psdocs) this.response.body.rdict[i.rid] = { _id: i.rid };
        }

        // TODO: export contest ranklist
        const [, rows] = await Hydro.model.contest.getScoreboard.call(this, domainId, tid, { isExport: true, lockAt: this.tdoc.lockAt });
        const row = rows.find((r) => r.find((c) => c.type === 'user' && c.raw === this.user._id));

        this.response.body.rankdata = {
            rank: row.find((c) => c.type === 'rank').value || '(不详)',
            total: rows.length - 1,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('contest_report', '/contest/:tid/report', ContestReportHandler, PERM.PERM_VIEW_CONTEST);
}
