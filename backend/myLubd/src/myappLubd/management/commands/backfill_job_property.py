from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from myappLubd.models import Job


class Command(BaseCommand):
    help = 'Backfill nullable Job.property from authoritative Area/Room relations.'

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--dry-run', action='store_true', help='Report only; this is the default.')
        mode.add_argument('--apply', action='store_true', help='Populate only unambiguous NULL Job.property rows.')
        parser.add_argument('--batch-size', type=int, default=500)
        parser.add_argument('--job-id', help='Restrict the audit/backfill to one Job.job_id.')

    @staticmethod
    def _candidate_property_ids(job):
        area_property_ids = {job.area.property_id} if job.area_id else set()
        room_property_ids = {
            property_obj.id
            for room in job.rooms.all()
            for property_obj in room.properties.all()
        }
        return area_property_ids | room_property_ids, area_property_ids, room_property_ids

    @staticmethod
    def _source_kind(area_property_ids, room_property_ids):
        if area_property_ids and room_property_ids:
            return 'AREA_AND_ROOMS_MATCH'
        if area_property_ids:
            return 'AREA_ONLY'
        return 'ROOMS_ONLY'

    def _jobs_in_batches(self, queryset, batch_size):
        last_pk = 0
        while True:
            batch = list(
                queryset.filter(pk__gt=last_pk)
                .select_related('area__property')
                .prefetch_related('rooms__properties')
                .order_by('pk')[:batch_size]
            )
            if not batch:
                return
            yield batch
            last_pk = batch[-1].pk

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        if batch_size <= 0:
            raise CommandError('--batch-size must be positive.')

        applying = options['apply']
        queryset = Job.objects.all()
        if options.get('job_id'):
            queryset = queryset.filter(job_id=options['job_id'])

        summary = Counter()
        sources = Counter()
        missing_jobs = []
        conflicting_jobs = []
        existing_property_conflicts = []
        updates_by_property = defaultdict(list)

        for batch in self._jobs_in_batches(queryset, batch_size):
            for job in batch:
                summary['TOTAL JOBS'] += 1
                candidate_ids, area_ids, room_ids = self._candidate_property_ids(job)

                if job.property_id is not None:
                    summary['PROPERTY ALREADY POPULATED'] += 1
                    if candidate_ids and candidate_ids != {job.property_id}:
                        existing_property_conflicts.append((job, area_ids, room_ids))
                    continue

                summary['PROPERTY NULL'] += 1
                if len(candidate_ids) == 0:
                    summary['MISSING'] += 1
                    missing_jobs.append(job)
                elif len(candidate_ids) > 1:
                    summary['CONFLICTING'] += 1
                    conflicting_jobs.append((job, area_ids, room_ids))
                else:
                    summary['UNAMBIGUOUS'] += 1
                    sources[self._source_kind(area_ids, room_ids)] += 1
                    updates_by_property[next(iter(candidate_ids))].append(job.pk)

        summary['WOULD UPDATE'] = sum(len(job_pks) for job_pks in updates_by_property.values())
        summary['SKIPPED'] = summary['PROPERTY ALREADY POPULATED'] + summary['MISSING'] + summary['CONFLICTING']

        self.stdout.write(f"MODE: {'APPLY' if applying else 'DRY RUN'}")
        for key in (
            'TOTAL JOBS', 'PROPERTY ALREADY POPULATED', 'PROPERTY NULL', 'UNAMBIGUOUS',
            'MISSING', 'CONFLICTING', 'WOULD UPDATE', 'SKIPPED',
        ):
            self.stdout.write(f'{key}: {summary[key]}')
        for key in ('AREA_ONLY', 'ROOMS_ONLY', 'AREA_AND_ROOMS_MATCH'):
            self.stdout.write(f'{key}: {sources[key]}')

        self.stdout.write('MISSING JOBS: ' + (', '.join(f'{job.job_id} (pk={job.pk})' for job in missing_jobs) or 'none'))
        self.stdout.write(
            'CONFLICTING JOBS: ' + (
                ', '.join(
                    f'{job.job_id} (pk={job.pk}, area={sorted(area_ids)}, rooms={sorted(room_ids)})'
                    for job, area_ids, room_ids in conflicting_jobs
                ) or 'none'
            )
        )
        self.stdout.write(
            'EXISTING PROPERTY CONFLICTS: ' + (
                ', '.join(
                    f'{job.job_id} (pk={job.pk}, property={job.property_id}, area={sorted(area_ids)}, rooms={sorted(room_ids)})'
                    for job, area_ids, room_ids in existing_property_conflicts
                ) or 'none'
            )
        )

        if not applying:
            self.stdout.write(self.style.SUCCESS('Dry run complete: zero rows written.'))
            return

        if existing_property_conflicts:
            raise CommandError('EXISTING PROPERTY CONFLICT detected; no rows were updated.')

        updated = 0
        for property_id, job_pks in updates_by_property.items():
            for start in range(0, len(job_pks), batch_size):
                batch_pks = job_pks[start:start + batch_size]
                with transaction.atomic():
                    updated += Job.objects.filter(
                        pk__in=batch_pks,
                        property__isnull=True,
                    ).update(property_id=property_id)

        self.stdout.write(f'UPDATED: {updated}')
        self.stdout.write(self.style.SUCCESS('Backfill apply complete.'))
