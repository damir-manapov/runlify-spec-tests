package com.runlify.graphql;

import com.runlify.metadata.EntityMetadata;
import com.runlify.schema.SchemaGenerator;
import graphql.schema.DataFetcher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Map;

/**
 * Data fetchers for periodic info-registry slice queries:
 * sliceOfTheLast and sliceOfTheFirst.
 */
@Component
public class SliceDataFetcherFactory {

    private final JdbcTemplate jdbc;

    public SliceDataFetcherFactory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * sliceOfTheLastEntity(date, ...dimensions):
     * SELECT * WHERE date <= ? AND dim1 = ? ... ORDER BY date DESC LIMIT 1
     */
    public DataFetcher<Map<String, Object>> sliceOfTheLast(EntityMetadata entity) {
        return buildSliceFetcher(entity, "<=", "DESC");
    }

    /**
     * sliceOfTheFirstEntity(date, ...dimensions):
     * SELECT * WHERE date >= ? AND dim1 = ? ... ORDER BY date ASC LIMIT 1
     */
    public DataFetcher<Map<String, Object>> sliceOfTheFirst(EntityMetadata entity) {
        return buildSliceFetcher(entity, ">=", "ASC");
    }

    private DataFetcher<Map<String, Object>> buildSliceFetcher(
        EntityMetadata entity, String dateOp, String sortDir
    ) {
        var table = SchemaGenerator.tableName(entity);
        return env -> {
            var conditions = new ArrayList<String>();
            var params = new ArrayList<Object>();

            for (var dim : entity.dimensions()) {
                var value = env.getArgument(dim.name());
                if (value != null) {
                    if ("date".equals(dim.name())) {
                        conditions.add("\"date\" %s ?".formatted(dateOp));
                    } else {
                        conditions.add("\"%s\" = ?".formatted(dim.name()));
                    }
                    params.add(value);
                }
            }

            var sql = new StringBuilder("SELECT * FROM \"%s\"".formatted(table));
            if (!conditions.isEmpty()) {
                sql.append(" WHERE ").append(String.join(" AND ", conditions));
            }
            sql.append(" ORDER BY \"date\" %s LIMIT 1".formatted(sortDir));

            var rows = jdbc.queryForList(sql.toString(), params.toArray());
            return rows.isEmpty() ? null : rows.get(0);
        };
    }
}
